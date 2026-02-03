import { WebGLRenderer } from 'three';

declare module 'ngx-three' {
  interface ThEngineService {
    webglRenderer?: WebGLRenderer;
  }
}
