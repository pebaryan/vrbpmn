# SPEAR VR BPMN Authoring

Browser-based 3D/VR authoring tool for BPMN process definitions for the SPEAR semantic process engine. Diagrams export as BPMN 2.0 XML with BPMN DI, so they open in Camunda Modeler with the layout preserved. Desktop mouse/keyboard editing works everywhere; WebXR headsets get controller-based editing.

Product requirements: [`../PRD.md`](../PRD.md)

## Features

- **Elements**: start / message start events, message catch events, boundary events (timer, message, error, signal; interrupting or not), end events, user and service tasks, expanded subprocesses (nestable, resizable), exclusive / parallel / event-based gateways, multi-instance markers.
- **Editing**: add, move (multi-select and drag), link, delete, snap to grid, undo/redo, automatic flow routing.
- **Inspector**: edit names, IDs, descriptions, flow labels and conditions, boundary trigger, multi-instance; live validation with click-to-locate issues.
- **Files**: save/open `.vrbpmn.json`, import/export `.bpmn`, bundled samples, local autosave so a reload never loses work.
- **VR**: "Enter VR" in browsers with WebXR. Trigger acts in the current mode, grip teleports, left stick moves, right stick snap-turns, A/X cycles the mode, B/Y cycles the element type.

## Desktop controls

| Action | Input |
| --- | --- |
| Modes: move / add / link / delete | `M` (or `V`) / `A` / `L` / `D` |
| Pick element type (add mode) | `1`–`9`, `0`, `B` (boundary) |
| Select, multi-select | click, `Shift`+click, `Ctrl+A` |
| Move | drag an element |
| Orbit / pan / zoom | drag empty space / right-drag / wheel |
| Delete selection | `Delete` or `Backspace` |
| Undo / redo | `Ctrl+Z` / `Ctrl+Y` or `Ctrl+Shift+Z` |
| Save / open | `Ctrl+S` / `Ctrl+O` |
| Frame diagram, toggle snap, toggle inspector | `F`, `S`, `I` |
| Help, cancel | `?`, `Esc` |

## Project layout

- `src/app/app.ts`: root; hosts the 3D view and the overlay UI and drives autosave.
- `src/app/process-view-ngthree/process-state.service.ts`: diagram state (signals), history, validation, JSON and BPMN import/export.
- `src/app/process-view-ngthree/process-view-ngthree.component.*`: the three.js scene (ngx-three) and desktop interaction.
- `src/app/process-view-ngthree/vr-session.service.ts`: WebXR session, controllers, in-VR labels and HUD.
- `src/app/process-view-ngthree/connection-path.builder.ts`: orthogonal flow routing.
- `src/app/process-view-ngthree/ui/`: overlay (top bar, tool rail, palette, inspector, help) and SVG icons.
- `src/app/process-view-ngthree/process-view.constants.ts`: sizes, colours and per-type metadata.
- `samples/`: sample BPMN diagrams (copied to the build as assets).

## Commands

```bash
npm start        # dev server on http://localhost:4200/
npm run build    # production build into dist/
npm test         # Karma unit tests
```

WebXR needs a secure context: use `localhost` or serve over HTTPS when testing on a headset.
