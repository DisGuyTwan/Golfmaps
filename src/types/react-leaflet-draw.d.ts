declare module "react-leaflet-draw" {
  import type { ComponentType } from "react";

  /**
   * Minimal typings for react-leaflet-draw's EditControl. The library ships no
   * type definitions of its own, so we describe just the props this app uses.
   * `draw`/`edit` map directly to Leaflet.draw's toolbar options.
   */
  export interface EditControlProps {
    position?: "topright" | "topleft" | "bottomright" | "bottomleft";
    onCreated?: (event: { layerType: string; layer: L.Layer }) => void;
    onEdited?: (event: unknown) => void;
    onDeleted?: (event: unknown) => void;
    onMounted?: (event: unknown) => void;
    onEditStart?: (event: unknown) => void;
    onEditStop?: (event: unknown) => void;
    onDeleteStart?: (event: unknown) => void;
    onDeleteStop?: (event: unknown) => void;
    // Leaflet.draw toolbar configuration (rectangle-only in this app).
    draw?: Record<string, unknown>;
    edit?: Record<string, unknown>;
  }

  export const EditControl: ComponentType<EditControlProps>;
}
