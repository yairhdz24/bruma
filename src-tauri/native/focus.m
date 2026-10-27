#import <AppKit/AppKit.h>
#import <ApplicationServices/ApplicationServices.h>
#include <stdlib.h>
#include <string.h>

// Reads a little context around the cursor of the focused text field, through Accessibility:
// the text right before the cursor (so Bruma knows whether to add a space or a capital letter)
// and the selected text (for "translate selection"). Password fields are never read.
// Returns a JSON object as UTF-8, or NULL. Free with bruma_free_symbol_data.

static NSString *string_attribute(AXUIElementRef element, CFStringRef attribute) {
    CFTypeRef value = NULL;
    if (AXUIElementCopyAttributeValue(element, attribute, &value) != kAXErrorSuccess || value == NULL) return nil;
    NSString *result = nil;
    if (CFGetTypeID(value) == CFStringGetTypeID()) result = [(__bridge NSString *)value copy];
    CFRelease(value);
    return result;
}

static BOOL range_attribute(AXUIElementRef element, CFRange *range) {
    CFTypeRef value = NULL;
    if (AXUIElementCopyAttributeValue(element, kAXSelectedTextRangeAttribute, &value) != kAXErrorSuccess || value == NULL) return NO;
    BOOL ok = CFGetTypeID(value) == AXValueGetTypeID() && AXValueGetValue((AXValueRef)value, kAXValueTypeCFRange, range);
    CFRelease(value);
    return ok;
}

static NSString *string_for_range(AXUIElementRef element, CFRange range) {
    AXValueRef wanted = AXValueCreate(kAXValueTypeCFRange, &range);
    if (wanted == NULL) return nil;
    CFTypeRef value = NULL;
    AXError error = AXUIElementCopyParameterizedAttributeValue(element, kAXStringForRangeParameterizedAttribute, wanted, &value);
    CFRelease(wanted);
    if (error != kAXErrorSuccess || value == NULL) return nil;
    NSString *result = nil;
    if (CFGetTypeID(value) == CFStringGetTypeID()) result = [(__bridge NSString *)value copy];
    CFRelease(value);
    return result;
}

char *bruma_focused_context(int max_before, int wake_electron) {
    @autoreleasepool {
        @try {
            if (!AXIsProcessTrusted()) return NULL;
            max_before = MAX(0, MIN(max_before, 2000));
            AXUIElementRef system = AXUIElementCreateSystemWide();
            if (system == NULL) return NULL;
            AXUIElementSetMessagingTimeout(system, 0.25f);
            CFTypeRef appValue = NULL;
            AXUIElementCopyAttributeValue(system, kAXFocusedApplicationAttribute, &appValue);
            CFRelease(system);
            if (appValue == NULL) return NULL;
            AXUIElementRef app = (AXUIElementRef)appValue;
            AXUIElementSetMessagingTimeout(app, 0.25f);
            // Chromium and Electron apps (Slack, Discord, Claude) expose their text fields only after an
            // assistive app asks for it. Never for code editors: VS Code-based editors would switch to
            // their screen-reader mode.
            if (wake_electron) AXUIElementSetAttributeValue(app, CFSTR("AXManualAccessibility"), kCFBooleanTrue);
            CFTypeRef focusedValue = NULL;
            AXUIElementCopyAttributeValue(app, kAXFocusedUIElementAttribute, &focusedValue);
            CFRelease(app);
            if (focusedValue == NULL) return NULL;
            AXUIElementRef focused = (AXUIElementRef)focusedValue;

            NSString *role = string_attribute(focused, kAXRoleAttribute) ?: @"";
            NSString *subrole = string_attribute(focused, kAXSubroleAttribute) ?: @"";
            BOOL secure = [role isEqualToString:@"AXSecureTextField"] || [subrole isEqualToString:@"AXSecureTextField"];
            NSString *selected = @"";
            NSString *before = @"";
            BOOL editable = NO;
            if (!secure) {
                selected = string_attribute(focused, kAXSelectedTextAttribute) ?: @"";
                CFRange range;
                if (range_attribute(focused, &range) && range.location != kCFNotFound && range.location >= 0) {
                    editable = YES;
                    CFIndex start = MAX(0, range.location - max_before);
                    before = string_for_range(focused, CFRangeMake(start, range.location - start));
                    if (before == nil) {
                        NSString *value = string_attribute(focused, kAXValueAttribute);
                        if (value != nil && (NSUInteger)range.location <= value.length) {
                            NSRange wanted = NSMakeRange((NSUInteger)start, (NSUInteger)(range.location - start));
                            // Never cut a composed character (emoji, accents) in half.
                            wanted = [value rangeOfComposedCharacterSequencesForRange:wanted];
                            before = [value substringWithRange:NSIntersectionRange(wanted, NSMakeRange(0, value.length))];
                        }
                    }
                }
            }
            CFRelease(focused);
            if (selected.length > 12000) selected = [selected substringToIndex:[selected rangeOfComposedCharacterSequenceAtIndex:12000].location];
            NSDictionary *result = @{ @"secure": @(secure), @"editable": @(editable), @"role": role,
                                      @"selected": selected ?: @"", @"before": before ?: @"" };
            NSData *json = [NSJSONSerialization dataWithJSONObject:result options:0 error:nil];
            if (json == nil) return NULL;
            NSString *text = [[NSString alloc] initWithData:json encoding:NSUTF8StringEncoding];
            return text ? strdup(text.UTF8String) : NULL;
        } @catch (NSException *exception) { (void)exception; return NULL; }
    }
}

// The text around the cursor in the focused field (up to `before` characters before it and
// `after` after it) plus the owning process, to notice when the user fixes a dictated word.
// Password fields return NULL. JSON: {"pid":123,"text":"..."}.
char *bruma_focused_text(int before, int after) {
    @autoreleasepool {
        @try {
            if (!AXIsProcessTrusted()) return NULL;
            before = MAX(0, MIN(before, 4000)); after = MAX(0, MIN(after, 4000));
            AXUIElementRef system = AXUIElementCreateSystemWide();
            if (system == NULL) return NULL;
            AXUIElementSetMessagingTimeout(system, 0.25f);
            CFTypeRef focusedValue = NULL;
            AXUIElementCopyAttributeValue(system, kAXFocusedUIElementAttribute, &focusedValue);
            CFRelease(system);
            if (focusedValue == NULL) return NULL;
            AXUIElementRef focused = (AXUIElementRef)focusedValue;
            AXUIElementSetMessagingTimeout(focused, 0.25f);
            NSString *role = string_attribute(focused, kAXRoleAttribute) ?: @"";
            NSString *subrole = string_attribute(focused, kAXSubroleAttribute) ?: @"";
            pid_t pid = 0;
            AXUIElementGetPid(focused, &pid);
            NSString *text = nil;
            if (![role isEqualToString:@"AXSecureTextField"] && ![subrole isEqualToString:@"AXSecureTextField"]) {
                CFRange range;
                CFTypeRef count = NULL;
                CFIndex total = -1;
                if (AXUIElementCopyAttributeValue(focused, kAXNumberOfCharactersAttribute, &count) == kAXErrorSuccess && count != NULL) {
                    if (CFGetTypeID(count) == CFNumberGetTypeID()) CFNumberGetValue((CFNumberRef)count, kCFNumberCFIndexType, &total);
                    CFRelease(count);
                }
                if (range_attribute(focused, &range) && range.location != kCFNotFound && range.location >= 0) {
                    CFIndex start = MAX(0, range.location - before);
                    CFIndex end = range.location + range.length + after;
                    if (total >= 0) end = MIN(end, total);
                    if (end > start) text = string_for_range(focused, CFRangeMake(start, end - start));
                }
                if (text == nil) {
                    NSString *value = string_attribute(focused, kAXValueAttribute);
                    if (value.length > 0) text = value.length > (NSUInteger)(before + after) ? [value substringFromIndex:[value rangeOfComposedCharacterSequenceAtIndex:value.length - (NSUInteger)(before + after)].location] : value;
                }
            }
            CFRelease(focused);
            if (text == nil) return NULL;
            NSData *json = [NSJSONSerialization dataWithJSONObject:@{ @"pid": @(pid), @"text": text } options:0 error:nil];
            if (json == nil) return NULL;
            NSString *out = [[NSString alloc] initWithData:json encoding:NSUTF8StringEncoding];
            return out ? strdup(out.UTF8String) : NULL;
        } @catch (NSException *exception) { (void)exception; return NULL; }
    }
}
