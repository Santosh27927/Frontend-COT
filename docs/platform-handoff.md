# Android first, iOS later: feasibility handoff

Scope selected by the user: browser prototype plus feasibility/handoff only. No Android/iOS project, APK/IPA, emulator/simulator run, signing or publication was created. Browser screenshot/test evidence is recorded separately; desktop Chrome with mobile dimensions does not establish physical-device or WebView compatibility.

## Architecture to carry forward

Keep the authoritative service reachable over HTTPS. The current request-dependent Next route handlers and filesystem-backed mock cannot run inside a static mobile asset bundle. Next's static-export documentation excludes handlers that require a Request or server-time logic. Therefore a future build must separate the browser bundle from its API before packaging. This is an architectural inference from the implemented routes and the [official static-export constraints](https://nextjs.org/docs/app/guides/static-exports).

A web shell such as Capacitor is a feasibility candidate because the current React interface could be reused. It is not a final renderer selection. Capacitor copies a built web bundle from its configured webDir into native projects; it does not package this Node financial service. See [official installation/bundle requirements](https://capacitorjs.com/docs/getting-started). A game-engine renderer is another later design decision; both must use the same typed backend contract.

Android would require Android Studio plus a supported device/emulator and current WebView. iOS would require Xcode and WKWebView integration. Recheck toolchain/platform requirements when starting those builds; no project has been initialized here. Sources checked 25 November 2026: [Android documentation](https://capacitorjs.com/docs/android), [iOS documentation](https://capacitorjs.com/docs/ios).

## Platform work still to test

| Area                | Requirement before mobile handoff is considered verified                                                                                                                                                                                  |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| API transport       | Reachable HTTPS API, native-origin/CORS policy, authenticated ownership, refresh/expiry handling; never expose dev routes or fake accounts                                                                                                |
| Lifecycle           | Background for >180 seconds then resume; fetch service state, retain original lesson deadline and once-only settlement. Resume after construction/cooldown endpoints. Force-kill during uncertain delivery then retry the original intent |
| Recovery storage    | Choose and validate durable owner-scoped pending-intent storage and protected credential storage. The prototype's tab session storage is not a native credential design                                                                   |
| Session replacement | Sign in on phone B while A is backgrounded/offline; A must lose authority immediately and show the notice after its next request                                                                                                          |
| Android interaction | Hardware/system Back closes the current dialog/navigation safely; keyboard quantity/PIN editing, rotation, system bars, accessibility text scaling and touch targets                                                                      |
| iOS interaction     | Safe-area insets/notches, software keyboard resizing, focus/dialog behavior, foreground refresh, WebKit numeric input and storage lifecycle                                                                                               |
| Orientation/design  | Landscape as primary mode, portrait fallback tested; native orientation policy agreed with design team. Replace CSS buildings without changing building IDs or command semantics                                                          |
| Network             | Airplane mode before a fresh action; response loss after server acceptance; reconnect; slow/out-of-order replies; captive portal/server failure                                                                                           |
| Safety              | Server-side authorization/validation, receipt uniqueness, real database transactions/workers, secret handling, no production mock reset/clock/export endpoints                                                                            |
| Performance         | Physical-device chart/input/frame timing, memory and battery over repeated lessons; no performance claim from browser screenshots                                                                                                         |

Capacitor's App API exposes foreground/background events and Android back-button handling; a future adapter can use these to trigger service refresh and UI navigation. They must not start/restart financial timers on the device. See the [official App lifecycle API](https://capacitorjs.com/docs/apis/app).

## Handoff ownership

Backend owns clocks, prices, storage/margin, progression, production, quotes, rewards, pending credits and transaction/recovery guarantees. Frontend owns rendering, unsent input, focus/navigation and delivery identity. Design owns final art/layout/motion and confirms mobile interaction states. Platform/DevOps owns API reachability, native shell/toolchains, credentials, lifecycle evidence, packaging and distribution. The future back office uses the existing validated policy catalog with staff authorization/audit; it does not create a second financial rule engine.
