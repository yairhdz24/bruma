#import <AppKit/AppKit.h>

// The pill window: above the Dock and every app (a status-level panel), on every Space and
// over full-screen apps, and never part of the app's window cycle.
void bruma_overlay_configure(void *ns_window) {
    NSWindow *window = (__bridge NSWindow *)ns_window;
    if (window == nil) return;
    void (^apply)(void) = ^{
        window.level = NSStatusWindowLevel;
        window.collectionBehavior = NSWindowCollectionBehaviorCanJoinAllSpaces | NSWindowCollectionBehaviorFullScreenAuxiliary
            | NSWindowCollectionBehaviorStationary | NSWindowCollectionBehaviorIgnoresCycle;
        window.hidesOnDeactivate = NO;
    };
    if (NSThread.isMainThread) apply(); else dispatch_sync(dispatch_get_main_queue(), apply);
}

// Points taken by the Dock at the bottom of the screen under the pointer, including a Dock that
// hides itself (it slides over whatever is there), so the pill can always sit just above it.
static double dock_clearance_on_main(void);
double bruma_dock_clearance(void) {
    if (NSThread.isMainThread) return dock_clearance_on_main();
    __block double result = 0;
    dispatch_sync(dispatch_get_main_queue(), ^{ result = dock_clearance_on_main(); });
    return result;
}

static double dock_clearance_on_main(void) {
    @autoreleasepool {
        NSPoint mouse = NSEvent.mouseLocation;
        NSScreen *screen = NSScreen.mainScreen;
        for (NSScreen *candidate in NSScreen.screens) {
            if (NSPointInRect(mouse, candidate.frame)) { screen = candidate; break; }
        }
        if (screen == nil) return 0;
        double inset = NSMinY(screen.visibleFrame) - NSMinY(screen.frame);
        NSDictionary *dock = [NSUserDefaults.standardUserDefaults persistentDomainForName:@"com.apple.dock"];
        NSString *orientation = [dock[@"orientation"] isKindOfClass:NSString.class] ? dock[@"orientation"] : @"bottom";
        BOOL autohide = [dock[@"autohide"] respondsToSelector:@selector(boolValue)] && [dock[@"autohide"] boolValue];
        if ([orientation isEqualToString:@"bottom"]) {
            double tile = [dock[@"tilesize"] respondsToSelector:@selector(doubleValue)] ? [dock[@"tilesize"] doubleValue] : 48;
            if (tile < 16 || tile > 128) tile = 48;
            // The Dock is the icons plus its own padding; when it hides, reserve what it will cover.
            double dock_height = tile + 20;
            if (autohide) inset = MAX(inset, dock_height);
        }
        return inset;
    }
}
