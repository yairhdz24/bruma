#import <AppKit/AppKit.h>
#import <ApplicationServices/ApplicationServices.h>
#include <stdatomic.h>

// Watches the fn (🌐) key system-wide so it can start and stop dictation on its own,
// the way modern dictation apps do. Nothing is recorded or stored: the tap only looks at
// modifier changes and tells Rust "fn went down / up" or "fn was used in a combination".
//
// An active tap (not listen-only) works with the Accessibility permission Bruma already
// has for pasting, so no extra Input Monitoring prompt is needed. Every event is passed
// through unchanged.

typedef void (*bruma_key_callback)(int kind, int shift);
enum { KEY_FN_DOWN = 1, KEY_FN_UP = 2, KEY_FN_COMBO = 3, KEY_FN_SPACE_DOWN = 4, KEY_FN_SPACE_UP = 5 };

static bruma_key_callback callback = NULL;
static CFMachPortRef tap = NULL;
static atomic_bool fn_down = false;
static atomic_bool running = false;
static atomic_bool tap_ready = false;
// When on, fn + Space is Bruma's key: the Space press is swallowed so no space gets typed.
static atomic_bool space_mode = false;
static atomic_bool space_down = false;

static CGEventRef on_event(CGEventTapProxy proxy, CGEventType type, CGEventRef event, void *info) {
    (void)proxy; (void)info;
    if (type == kCGEventTapDisabledByTimeout || type == kCGEventTapDisabledByUserInput) {
        if (tap) CGEventTapEnable(tap, true);
        return event;
    }
    if (callback == NULL) return event;
    CGEventFlags flags = CGEventGetFlags(event);
    BOOL shift = (flags & kCGEventFlagMaskShift) != 0;
    if ((type == kCGEventKeyDown || type == kCGEventKeyUp) && atomic_load(&space_mode)
        && CGEventGetIntegerValueField(event, kCGKeyboardEventKeycode) == 49) { // kVK_Space
        if (type == kCGEventKeyDown && atomic_load(&fn_down)) {
            if (!atomic_load(&space_down)) { atomic_store(&space_down, true); callback(KEY_FN_SPACE_DOWN, shift); }
            return NULL; // key repeats while held are swallowed too
        }
        if (type == kCGEventKeyUp && atomic_load(&space_down)) {
            atomic_store(&space_down, false); callback(KEY_FN_SPACE_UP, shift);
            return NULL;
        }
    }
    if (type == kCGEventFlagsChanged) {
        int64_t code = CGEventGetIntegerValueField(event, kCGKeyboardEventKeycode);
        if (code == 63 || code == 179) { // kVK_Function, and the Globe key on newer keyboards
            BOOL down = (flags & kCGEventFlagMaskSecondaryFn) != 0;
            if (down && !atomic_load(&fn_down)) { atomic_store(&fn_down, true); callback(KEY_FN_DOWN, shift); }
            else if (!down && atomic_load(&fn_down)) {
                atomic_store(&fn_down, false); callback(KEY_FN_UP, shift);
                // fn released before Space: finish the fn + Space press as well.
                if (atomic_load(&space_down)) { atomic_store(&space_down, false); callback(KEY_FN_SPACE_UP, shift); }
            }
        } else if (atomic_load(&fn_down)) {
            // Shift while fn is down chooses the translator; any other modifier is a combination.
            BOOL isShift = code == 56 || code == 60;
            if (!isShift) callback(KEY_FN_COMBO, shift);
        }
    } else if (type == kCGEventKeyDown && atomic_load(&fn_down) && !atomic_load(&space_down)) {
        // fn + arrows, fn + delete, fn + F-keys... belong to the user, not to dictation.
        callback(KEY_FN_COMBO, shift);
    }
    return event;
}

static void run_tap_thread(void) {
    @autoreleasepool {
        CGEventMask mask = CGEventMaskBit(kCGEventFlagsChanged) | CGEventMaskBit(kCGEventKeyDown) | CGEventMaskBit(kCGEventKeyUp);
        // Without Accessibility the tap cannot be created yet; keep trying quietly.
        while (tap == NULL) {
            tap = CGEventTapCreate(kCGSessionEventTap, kCGHeadInsertEventTap, kCGEventTapOptionDefault, mask, on_event, NULL);
            if (tap == NULL) [NSThread sleepForTimeInterval:2.0];
        }
        CFRunLoopSourceRef source = CFMachPortCreateRunLoopSource(kCFAllocatorDefault, tap, 0);
        CFRunLoopAddSource(CFRunLoopGetCurrent(), source, kCFRunLoopCommonModes);
        CGEventTapEnable(tap, true);
        atomic_store(&tap_ready, true);
        CFRunLoopRun();
    }
}

// Starts the watcher once. Returns 1 when it was started by this call.
int bruma_keys_start(bruma_key_callback cb) {
    if (cb == NULL) return 0;
    callback = cb;
    bool expected = false;
    if (!atomic_compare_exchange_strong(&running, &expected, true)) return 0;
    NSThread *thread = [[NSThread alloc] initWithBlock:^{ run_tap_thread(); }];
    thread.name = @"Bruma fn key";
    thread.qualityOfService = NSQualityOfServiceUserInteractive;
    [thread start];
    return 1;
}

// 1 once the system accepted the tap (Accessibility granted), 0 while still waiting.
int bruma_keys_ready(void) { return atomic_load(&tap_ready) ? 1 : 0; }

// 1: fn + Space starts dictation (and Space is not typed while fn is held). 0: fn alone.
void bruma_keys_space_mode(int enabled) { atomic_store(&space_mode, enabled != 0); }
