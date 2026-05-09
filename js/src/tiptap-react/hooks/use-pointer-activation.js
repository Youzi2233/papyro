import { useRef } from "react";

function preventMenuPointer(event) {
  event?.preventDefault?.();
  event?.stopPropagation?.();
  event?.nativeEvent?.stopImmediatePropagation?.();
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
      preventMenuPointer(event);
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
