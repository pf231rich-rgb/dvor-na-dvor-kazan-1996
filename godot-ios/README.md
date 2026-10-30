# Дворовые разборки: Казань 1996 — Godot iOS prototype

This is a native Godot project, not a browser game.

## Target
- Engine: Godot 3.6.3 (GDScript, GLES2)
- Development host: Windows 7 x64, 8 GB RAM (best-effort compatibility)
- Device target: iPhone 15
- Orientation: landscape
- First milestone: one playable yard encounter with touch controls

## Open on Windows
1. Download the standard (non-.NET) Godot 3.6.3 Windows x86_64 editor from https://godotengine.org/download/3.x/windows/.
2. Extract the archive.
3. Run Godot and import this folder: `godot-ios/`.
4. Press F6 or F5 to run the prototype.

The prototype uses only built-in drawing and GDScript. No paid assets or plugins are required.

## Controls
- Keyboard: WASD or arrow keys to move; J or Space to attack.
- Touch: directional controls on the left; attack button on the right.
- Restart after a win/loss: R.

## Current status
This is an initial playable mechanics prototype. The visuals are deliberately placeholder pixel-style shapes. It is not yet a finished game and has not been tested on an iPhone.

## iOS build reality
Godot's official iOS export workflow requires macOS with Xcode. Windows can be used to author and test the project, but cannot produce the final signed iOS app by itself.
A cloud macOS runner may be used for the export stage, subject to available free minutes and Apple signing requirements. A free Apple ID can be used for limited personal-device testing; provisioning/signing rules and short-lived profiles apply. App Store / TestFlight distribution requires Apple Developer Program membership.

Official docs:
- https://docs.godotengine.org/en/3.6/tutorials/export/exporting_for_ios.html
- https://docs.godotengine.org/en/3.6/about/system_requirements.html
