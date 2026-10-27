#import <AVFoundation/AVFoundation.h>
#import <ApplicationServices/ApplicationServices.h>
#import <Foundation/Foundation.h>
#import <dispatch/dispatch.h>

// Read-only: never prompts or starts an audio capture session.
int bruma_microphone_status(void) {
    @autoreleasepool {
        @try { return (int)[AVCaptureDevice authorizationStatusForMediaType:AVMediaTypeAudio]; }
        @catch (NSException *exception) { (void)exception; return -1; }
    }
}

// Invoked only by the explicit onboarding button, from a Rust blocking worker.
int bruma_request_microphone_permission(void) {
    @autoreleasepool {
        if ([NSThread isMainThread]) return bruma_microphone_status();
        @try {
            if ([AVCaptureDevice authorizationStatusForMediaType:AVMediaTypeAudio] != AVAuthorizationStatusNotDetermined) {
                return bruma_microphone_status();
            }
            dispatch_semaphore_t completed = dispatch_semaphore_create(0);
            [AVCaptureDevice requestAccessForMediaType:AVMediaTypeAudio completionHandler:^(BOOL granted) {
                (void)granted;
                dispatch_semaphore_signal(completed);
            }];
            // An unanswered system dialog remains notDetermined; never claim it was granted.
            dispatch_semaphore_wait(completed, dispatch_time(DISPATCH_TIME_NOW, 45 * NSEC_PER_SEC));
            return bruma_microphone_status();
        } @catch (NSException *exception) { (void)exception; return -1; }
    }
}

int bruma_accessibility_status(int prompt) {
    @autoreleasepool {
        @try {
            if (!prompt) return AXIsProcessTrusted() ? 1 : 0;
            NSDictionary *options = @{(__bridge NSString *)kAXTrustedCheckOptionPrompt: @YES};
            return AXIsProcessTrustedWithOptions((__bridge CFDictionaryRef)options) ? 1 : 0;
        } @catch (NSException *exception) { (void)exception; return -1; }
    }
}
