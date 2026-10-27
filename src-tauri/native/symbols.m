#import <AppKit/AppKit.h>
#include <stdlib.h>
#include <string.h>

// Rasterize only the local operating system's symbol. No symbol font or asset is
// bundled, downloaded, written to disk, or exported on other platforms.
char *bruma_system_symbol_png(const char *symbol_name) {
    @autoreleasepool {
        if (symbol_name == NULL || ![NSThread isMainThread]) return NULL;
        @try {
            if (@available(macOS 11.0, *)) {
                NSString *name = [NSString stringWithUTF8String:symbol_name];
                if (name == nil) return NULL;
                NSImage *image = [NSImage imageWithSystemSymbolName:name accessibilityDescription:nil];
                if (image == nil) return NULL;
                NSImageSymbolConfiguration *configuration =
                    [NSImageSymbolConfiguration configurationWithPointSize:28.0 weight:NSFontWeightRegular];
                image = [image imageWithSymbolConfiguration:configuration];
                if (image == nil || image.size.width <= 0 || image.size.height <= 0) return NULL;

                const NSInteger pixels = 64;
                NSBitmapImageRep *bitmap = [[NSBitmapImageRep alloc]
                    initWithBitmapDataPlanes:NULL
                    pixelsWide:pixels pixelsHigh:pixels bitsPerSample:8
                    samplesPerPixel:4 hasAlpha:YES isPlanar:NO
                    colorSpaceName:NSDeviceRGBColorSpace
                    bytesPerRow:pixels * 4 bitsPerPixel:32];
                if (bitmap == nil) return NULL;
                bitmap.size = NSMakeSize(pixels, pixels);
                NSGraphicsContext *context = [NSGraphicsContext graphicsContextWithBitmapImageRep:bitmap];
                if (context == nil) return NULL;
                NSRect canvas = NSMakeRect(0, 0, pixels, pixels);
                CGFloat scale = 60.0 / MAX(image.size.width, image.size.height);
                NSSize drawnSize = NSMakeSize(image.size.width * scale, image.size.height * scale);
                NSRect destination = NSMakeRect((pixels - drawnSize.width) / 2.0,
                    (pixels - drawnSize.height) / 2.0, drawnSize.width, drawnSize.height);
                [NSGraphicsContext saveGraphicsState];
                @try {
                    [NSGraphicsContext setCurrentContext:context];
                    context.imageInterpolation = NSImageInterpolationHigh;
                    NSRectFillUsingOperation(canvas, NSCompositingOperationClear);
                    [image drawInRect:destination fromRect:NSZeroRect
                        operation:NSCompositingOperationSourceOver fraction:1.0
                        respectFlipped:NO hints:nil];
                    // A monochrome alpha mask lets the webview inherit currentColor.
                    [[NSColor blackColor] setFill];
                    NSRectFillUsingOperation(canvas, NSCompositingOperationSourceIn);
                    [context flushGraphics];
                } @finally {
                    [NSGraphicsContext restoreGraphicsState];
                }
                NSData *png = [bitmap representationUsingType:NSBitmapImageFileTypePNG properties:@{}];
                if (png == nil || png.length == 0 || png.length > 65536) return NULL;
                NSString *encoded = [png base64EncodedStringWithOptions:0];
                return encoded == nil ? NULL : strdup(encoded.UTF8String);
            }
            return NULL;
        } @catch (NSException *exception) {
            // A missing/unsupported system asset must never prevent app startup.
            (void)exception;
            return NULL;
        }
    }
}

void bruma_free_symbol_data(char *data) { free(data); }
