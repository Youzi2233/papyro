import { useEffect, useRef } from "react"
import { useIsomorphicLayoutEffect } from "@/hooks/use-isomorphic-layout-effect";

/**
 * Custom hook that attaches event listeners to DOM elements, the window, or media query lists.
 * @template KW - The type of event for window events.
 * @template KH - The type of event for HTML or SVG element events.
 * @template KM - The type of event for media query list events.
 * @template T - The type of the DOM element (default is `HTMLElement`).
 * @param {KW | KH | KM} eventName - The name of the event to listen for.
 * @param {(event: WindowEventMap[KW] | HTMLElementEventMap[KH] | SVGElementEventMap[KH] | MediaQueryListEventMap[KM] | Event) => void} handler - The event handler function.
 * @param {RefObject<T>} [element] - The DOM element or media query list to attach the event listener to (optional).
 * @param {boolean | AddEventListenerOptions} [options] - An options object that specifies characteristics about the event listener (optional).
 */
function useEventListener(eventName, handler, element, options) {
  // Create a ref that stores handler
  const savedHandler = useRef(handler)

  useIsomorphicLayoutEffect(() => {
    savedHandler.current = handler
  }, [handler])

  useEffect(() => {
    // Define the listening target
    const targetElement = element?.current ?? window

    if (!(targetElement && targetElement.addEventListener)) return

    // Create event listener that calls handler function stored in ref
    const listener = (event) => {
      savedHandler.current(event)
    }

    targetElement.addEventListener(eventName, listener, options)

    // Remove event listener on cleanup
    return () => {
      targetElement.removeEventListener(eventName, listener, options)
    };
  }, [eventName, element, options])
}

export { useEventListener }

/**
 * Custom hook that handles clicks outside a specified element.
 * @template T - The type of the element's reference.
 * @param {RefObject<T> | RefObject<T>[]} ref - The React ref object(s) representing the element(s) to watch for outside clicks.
 * @param {(event: MouseEvent | TouchEvent | FocusEvent) => void} handler - The callback function to be executed when a click outside the element occurs.
 * @param {EventType} [eventType] - The mouse event type to listen for (optional, default is 'mousedown').
 * @param {?AddEventListenerOptions} [eventListenerOptions] - The options object to be passed to the `addEventListener` method (optional).
 * @returns {void}
 */
export function useOnClickOutside(ref, handler, eventType = "mousedown", eventListenerOptions = {}) {
  useEventListener(eventType, (event) => {
    const target = event.target

    // Do nothing if the target is not connected element with document
    if (!target || !target.isConnected) {
      return
    }

    const isOutside = Array.isArray(ref)
      ? ref
          .filter((r) => Boolean(r.current))
          .every((r) => r.current && !r.current.contains(target))
      : ref.current && !ref.current.contains(target)

    if (isOutside) {
      handler(event)
    }
  }, undefined, eventListenerOptions)
}
