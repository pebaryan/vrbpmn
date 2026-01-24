import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', redirectTo: 'process', pathMatch: 'full' },
  { path: 'process', loadComponent: () => import('./process-view-ngthree/process-view-ngthree.component').then(m => m.ProcessViewNgThreeComponent) },
];
