import { useRef } from "react";

function preventMenuPointer(event) {
  event?.preventDefault?.();
  event?.stopPropagation?.();
}

export function usePointerActivation(run) {
  const pointerActivated = useRef(false);

  return {
    onPointerDown(event) {
      preventMenuPointer(event);
      pointerActivated.current = true;
      run();
    },
    onClick(event) {
      preventMenuPointer(event);
      if (!pointerActivated.current) {
        run();
      }
      pointerActivated.current = false;
    },
    onMouseDown(event) {
      event?.preventDefault?.();
    },
    onAuxClick(event) {
      preventMenuPointer(event);
      pointerActivated.current = false;
    },
    onContextMenu(event) {
      preventMenuPointer(event);
      pointerActivated.current = false;
    },
  };
}
