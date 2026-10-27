#import <AppKit/AppKit.h>
#include <stdlib.h>
#include <string.h>

// Only the captured process's public app icon; no screenshots, window contents or file paths.
char *bruma_app_icon_png(int pid, const char *expected_bundle) {
    @autoreleasepool {
        if (![NSThread isMainThread] || pid <= 0 || expected_bundle == NULL) return NULL;
        @try {
            NSRunningApplication *app = [NSRunningApplication runningApplicationWithProcessIdentifier:pid];
            NSString *bundle = [NSString stringWithUTF8String:expected_bundle];
            if (app == nil || app.terminated || bundle == nil || ![app.bundleIdentifier isEqualToString:bundle]) return NULL;
            NSImage *image = app.icon;
            if (image == nil || image.size.width <= 0 || image.size.height <= 0) return NULL;
            const NSInteger pixels = 64;
            NSBitmapImageRep *bitmap = [[NSBitmapImageRep alloc]
                initWithBitmapDataPlanes:NULL pixelsWide:pixels pixelsHigh:pixels bitsPerSample:8
                samplesPerPixel:4 hasAlpha:YES isPlanar:NO colorSpaceName:NSDeviceRGBColorSpace
                bytesPerRow:pixels * 4 bitsPerPixel:32];
            if (bitmap == nil) return NULL;
            bitmap.size = NSMakeSize(pixels, pixels);
            NSGraphicsContext *context = [NSGraphicsContext graphicsContextWithBitmapImageRep:bitmap];
            if (context == nil) return NULL;
            CGFloat scale = 64.0 / MAX(image.size.width, image.size.height);
            NSSize size = NSMakeSize(image.size.width * scale, image.size.height * scale);
            NSRect rect = NSMakeRect((pixels - size.width) / 2.0, (pixels - size.height) / 2.0, size.width, size.height);
            [NSGraphicsContext saveGraphicsState];
            @try {
                [NSGraphicsContext setCurrentContext:context];
                context.imageInterpolation = NSImageInterpolationHigh;
                NSRectFillUsingOperation(NSMakeRect(0, 0, pixels, pixels), NSCompositingOperationClear);
                [image drawInRect:rect fromRect:NSZeroRect operation:NSCompositingOperationSourceOver
                    fraction:1.0 respectFlipped:NO hints:nil];
                [context flushGraphics];
            } @finally { [NSGraphicsContext restoreGraphicsState]; }
            NSData *png = [bitmap representationUsingType:NSBitmapImageFileTypePNG properties:@{}];
            if (png == nil || png.length == 0 || png.length > 65536) return NULL;
            return strdup([png base64EncodedStringWithOptions:0].UTF8String);
        } @catch (NSException *exception) { (void)exception; return NULL; }
    }
}

// The icon of an installed app found by its bundle identifier (history rows), as a 64 px PNG.
char *bruma_bundle_icon_png(const char *bundle_id) {
    @autoreleasepool {
        if (![NSThread isMainThread] || bundle_id == NULL) return NULL;
        @try {
            NSString *bundle = [NSString stringWithUTF8String:bundle_id];
            if (bundle.length == 0 || bundle.length > 200) return NULL;
            NSURL *url = [NSWorkspace.sharedWorkspace URLForApplicationWithBundleIdentifier:bundle];
            if (url == nil) return NULL;
            NSImage *image = [NSWorkspace.sharedWorkspace iconForFile:url.path];
            if (image == nil) return NULL;
            const NSInteger pixels = 64;
            NSBitmapImageRep *bitmap = [[NSBitmapImageRep alloc]
                initWithBitmapDataPlanes:NULL pixelsWide:pixels pixelsHigh:pixels bitsPerSample:8
                samplesPerPixel:4 hasAlpha:YES isPlanar:NO colorSpaceName:NSDeviceRGBColorSpace
                bytesPerRow:pixels * 4 bitsPerPixel:32];
            if (bitmap == nil) return NULL;
            bitmap.size = NSMakeSize(pixels, pixels);
            NSGraphicsContext *context = [NSGraphicsContext graphicsContextWithBitmapImageRep:bitmap];
            if (context == nil) return NULL;
            [NSGraphicsContext saveGraphicsState];
            @try {
                [NSGraphicsContext setCurrentContext:context];
                context.imageInterpolation = NSImageInterpolationHigh;
                NSRectFillUsingOperation(NSMakeRect(0, 0, pixels, pixels), NSCompositingOperationClear);
                [image drawInRect:NSMakeRect(0, 0, pixels, pixels) fromRect:NSZeroRect operation:NSCompositingOperationSourceOver fraction:1.0 respectFlipped:NO hints:nil];
                [context flushGraphics];
            } @finally { [NSGraphicsContext restoreGraphicsState]; }
            NSData *png = [bitmap representationUsingType:NSBitmapImageFileTypePNG properties:@{}];
            if (png == nil || png.length == 0 || png.length > 65536) return NULL;
            return strdup([png base64EncodedStringWithOptions:0].UTF8String);
        } @catch (NSException *exception) { (void)exception; return NULL; }
    }
}
