# AGENTS.md

## Project summary
- Angular 20 standalone app that renders a 3D BPMN authoring scene using `three` and `ngx-three`.
- Core UI lives in `src/app/process-view-ngthree`, with state in a service and a full-screen overlay UI.
- Product requirements are tracked in `PRD.md`.

## Tech stack
- Angular (standalone components, signals)
- Three.js + ngx-three for 3D scene/rendering
- SCSS for styling

## Key paths
- App bootstrap: `src/main.ts`, `src/app/app.ts`
- Root template/styles: `src/app/app.component.html`, `src/app/app.scss`
- 3D scene component: `src/app/process-view-ngthree/process-view-ngthree.component.ts`
- Scene state/service: `src/app/process-view-ngthree/process-state.service.ts`
- UI overlay: `src/app/process-view-ngthree/ui/ui-overlay.component.ts`
- Scene constants/types: `src/app/process-view-ngthree/process-view.constants.ts`, `src/app/process-view-ngthree/process-view.types.ts`

## Common commands
- Dev server: `npm run start` (Angular CLI `ng serve`)
- Build: `npm run build`
- Watch build: `npm run watch`
- Unit tests: `npm run test` (Karma, no watch)

## Conventions and gotchas
- Prefer Angular signals for state (`ProcessStateService`); update arrays with `set`/`update` to trigger reactivity.
- 3D geometry is cached in `ProcessViewNgThreeComponent` to avoid recreating buffers; dispose geometries/materials on destroy.
- Interaction modes (`move`, `add`, `link`, `delete`) are centralized in `ProcessStateService`; UI buttons map to these modes.
- Scene config values live in `process-view.constants.ts`; adjust visuals there before editing component logic.
- BPMN export includes BPMN DI so files open in Camunda Modeler; logic lives in `ProcessStateService`.

## Testing notes
- Current test entrypoint is `src/app/app.spec.ts` via Karma.
- No e2e framework configured.
