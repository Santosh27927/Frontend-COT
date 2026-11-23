# Mobile game frontend architecture

Status: planning baseline  
Updated: 2026-11-23

## Confirmed decisions

- Build for native mobile devices.
- Develop and test on physical Android devices first.
- Add iOS support later.
- Use a 2D isometric visual style.
- One contributor handles frontend, backend, integration, and DevOps.
- The second contributor handles design and graphics.
- Engineering skills will be learned alongside implementation.
- Use separate frontend, backend, and DevOps repositories.
- Use virtual funds for paper trading.
- Reset practice funds when starting a new scenario.
- The first playable release's exact feature set remains undecided.

## Technology baseline

Use Godot with typed GDScript.

The mobile game communicates with our backend using:

- HTTPS for commands and snapshots.
- Secure WebSockets for updates.

Phoenix Rise SDK integration belongs in the TypeScript backend.
The Godot client consumes our application contracts.

## Initial testing experience

The first testing mode supports:

- One human using an Android device.
- A clearly identified automated opponent.
- A shared, controlled scenario managed by the backend.
- Virtual balances initialized for that scenario.
- Recorded decisions, execution results, and explanations.

The opponent is a competing learner actor. It is separate from the
simulator's liquidity model.

## Structure

```text
game/
├── app/                    # Startup, navigation, dependency composition
├── features/
│   ├── village/
│   ├── trading/
│   ├── lessons/
│   ├── challenges/
│   ├── clans/
│   └── profile/
├── platform/
│   ├── authentication/
│   ├── http/
│   ├── websocket/
│   ├── configuration/
│   └── diagnostics/
├── ui/                     # Reusable visual components
├── assets/                 # Optimized graphics, animation, fonts, audio
└── tests/
```

Feature folders are ownership boundaries, not commitments to include
every feature in the first release.

Each substantial feature contains:

- Screens and components.
- Presentation logic.
- Feature state.
- API and event adapters.
- Focused tests.

## Dependency and state rules

- Components receive data and emit user intentions.
- Feature coordinators manage requests and presentation.
- Shared UI components contain no domain calculations.
- Features use explicit interfaces instead of accessing each other's
  internal state or arbitrary scene paths.
- Transport components handle communication, not trading decisions.

Trading state owns account snapshots, positions, orders, and trading events.
Village state owns building and resource snapshots.
Lesson state owns the active scenario and explanation.

Multiple screens subscribe to the same feature state.

Money and quantities cross application boundaries as decimal strings.
The backend owns authoritative calculations and outcomes.

## Mobile lifecycle

Handle:

- Application backgrounding and resumption.
- Wi-Fi changes and temporary disconnection.
- Interrupted requests.
- Duplicate submissions.
- Reconnection after missed events.

After resuming, retrieve current server state before treating financial
information as authoritative.

Snapshots and events carry revisions or cursors.

## Local-device connectivity

A physical phone connects to a reachable backend address on the development
computer or local network.

The phone's localhost refers to the phone itself.

Backend addresses are environment configuration, not scattered constants.
Restrict development network exposure to the intended testing network.

Production builds use HTTPS and WSS.

## Future two-player support

Use the same participant interface for humans and bots.

Start human testing with direct room creation and joining.
Public matchmaking can follow later.

Required additions include:

- Participant identity and authorization.
- Shared session state and server-controlled timing.
- Ready/start/finish transitions.
- Reconnect and timeout behavior.
- Consistent scenario versions.
- Server-side scoring.

The backend remains authoritative for both participants.

## Graphics workflow

Agree on:

- Isometric grid dimensions and object footprints.
- Sprite anchors and interaction areas.
- Animation states and naming.
- UI layouts and mobile readability.
- Asset formats and size budgets.

Keep optimized runtime assets in the game project.
Manage large editable artwork through an agreed asset store or Git LFS.

## Configuration and compatibility

The client reads only public application configuration.
Secrets remain outside the client.

Record:

- Client build version.
- Supported application contract version.
- Session and scenario identifiers.
- Configuration version.

Configuration can enable implemented features; new functionality may
still require a client update.

## Limitations

- Android testing does not validate iOS behavior.
- iOS requires a separate build, signing, and device-testing workflow.
- Godot iOS export requires macOS and Xcode.
- Bot sessions do not validate all human multiplayer failure cases.
- Local networking does not represent internet latency or mobile-network
  instability.
- Feature folders reduce coupling but do not isolate native process crashes.
- Learning the stack while implementing increases delivery uncertainty.
- Mobile performance and the dense trading interface remain unvalidated.
- Exact first-release scope is still open.

## Validation priorities

- One complete trading screen on the target Android devices.
- One scenario completed against an automated opponent.
- Reconnect and application-resume recovery.
- Consistent balances and positions across screens.
- Correct rendering of backend explanations.
- Touch targets, text readability, and isometric interaction accuracy.

## References

- [Godot scene organization](https://docs.godotengine.org/en/stable/tutorials/best_practices/scene_organization.html)
- [Android export](https://docs.godotengine.org/en/stable/tutorials/export/exporting_for_android.html)
- [iOS export](https://docs.godotengine.org/en/stable/tutorials/export/exporting_for_ios.html)
