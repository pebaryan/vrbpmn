import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Inline SVG icon set: tool icons plus BPMN element glyphs (named after NodeType values).
 */
@Component({
  selector: 'app-icon',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { 'aria-hidden': 'true' },
  styles: [`
    :host { display: inline-flex; width: var(--icon-size, 18px); height: var(--icon-size, 18px); flex: none; }
    svg { width: 100%; height: 100%; fill: none; stroke: currentColor; stroke-width: 1.75; stroke-linecap: round; stroke-linejoin: round; }
  `],
  template: `
    <svg viewBox="0 0 24 24">
      @switch (name()) {
        @case ('move') { <path d="M12 2v20M2 12h20M12 2 9 5M12 2l3 3M12 22l-3-3M12 22l3-3M2 12l3-3M2 12l3 3M22 12l-3-3M22 12l-3 3"/> }
        @case ('add') { <path d="M12 5v14M5 12h14"/> }
        @case ('link') { <path d="M10 13a5 5 0 0 0 7.07 0l3-3a5 5 0 0 0-7.07-7.07l-1.5 1.5M14 11a5 5 0 0 0-7.07 0l-3 3a5 5 0 0 0 7.07 7.07l1.5-1.5"/> }
        @case ('delete') { <path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 11v6M14 11v6"/> }
        @case ('snap') { <path d="M4 4h16v16H4zM4 10h16M4 15h16M10 4v16M15 4v16"/> }
        @case ('frame') { <path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3"/> }
        @case ('vr') { <path d="M3 8h18a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1h-5l-2-3h-4l-2 3H3a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/> }
        @case ('undo') { <path d="M9 14 4 9l5-5M4 9h11a5 5 0 0 1 0 10h-3"/> }
        @case ('redo') { <path d="m15 14 5-5-5-5M20 9H9a5 5 0 0 0 0 10h3"/> }
        @case ('new') { <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9zM14 3v6h6M12 12v6M9 15h6"/> }
        @case ('open') { <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/> }
        @case ('save') { <path d="M5 3h11l5 5v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM7 3v5h8M7 21v-7h10v7"/> }
        @case ('export') { <path d="M12 3v12M7 10l5 5 5-5M5 21h14"/> }
        @case ('samples') { <path d="m12 3 9 5-9 5-9-5 9-5zM3 13l9 5 9-5"/> }
        @case ('help') { <circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .8-1 1.5v.7M12 17h.01"/> }
        @case ('panel') { <path d="M3 4h18v16H3zM15 4v16"/> }
        @case ('alert') { <path d="M12 3 22 21H2zM12 10v5M12 18h.01"/> }
        @case ('check') { <path d="m5 12 5 5 9-10"/> }
        @case ('close') { <path d="M6 6l12 12M18 6 6 18"/> }
        @case ('chevron') { <path d="m6 9 6 6 6-6"/> }
        @case ('reroute') { <path d="M4 18h6V6h10M16 2l4 4-4 4"/> }

        @case ('start') { <circle cx="12" cy="12" r="8"/> }
        @case ('messageStart') { <circle cx="12" cy="12" r="9"/><path d="M7.5 9h9v6h-9zM7.5 9l4.5 3.2L16.5 9"/> }
        @case ('messageCatch') { <circle cx="12" cy="12" r="9.5"/><circle cx="12" cy="12" r="7.5"/><path d="M8.5 9.5h7v5h-7zM8.5 9.5l3.5 2.5 3.5-2.5"/> }
        @case ('boundary') { <circle cx="12" cy="12" r="9.5" stroke-dasharray="3 2.2"/><circle cx="12" cy="12" r="7"/><path d="M12 8.5V12l2.3 1.5"/> }
        @case ('terminal') { <circle cx="12" cy="12" r="8" stroke-width="3.5"/> }
        @case ('usertask') { <rect x="2.5" y="4.5" width="19" height="15" rx="3"/><circle cx="8.5" cy="9.5" r="1.7"/><path d="M5.8 14.6a2.7 2.7 0 0 1 5.4 0"/> }
        @case ('servicetask') { <rect x="2.5" y="4.5" width="19" height="15" rx="3"/><circle cx="8.5" cy="10" r="2"/><path d="M8.5 6.4v1.2M8.5 12.4v1.2M4.9 10h1.2M10.9 10h1.2"/> }
        @case ('subprocess') { <rect x="2.5" y="4.5" width="19" height="15" rx="3"/><path d="M10 13.5h4v4h-4zM12 14.5v2M11 15.5h2"/> }
        @case ('xgateway') { <path d="m12 2 10 10-10 10L2 12z"/><path d="m9 9 6 6M15 9l-6 6"/> }
        @case ('pgateway') { <path d="m12 2 10 10-10 10L2 12z"/><path d="M12 7.5v9M7.5 12h9"/> }
        @case ('eventgateway') { <path d="m12 2 10 10-10 10L2 12z"/><circle cx="12" cy="12" r="4.2"/><path d="m12 9.6 2.2 1.6-.8 2.6h-2.8l-.8-2.6z"/> }
      }
    </svg>
  `
})
export class IconComponent {
  readonly name = input.required<string>();
}
