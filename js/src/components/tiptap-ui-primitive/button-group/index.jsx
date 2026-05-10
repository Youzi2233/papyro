import { mergeProps } from "@base-ui/react/merge-props"
import { useRender } from "@base-ui/react/use-render"
import { cva } from "class-variance-authority";
import { cn } from "@/lib/tiptap-utils"
import { Separator } from "@/components/tiptap-ui-primitive/separator"
import "./button-group.scss"

const buttonGroupVariants = cva("tiptap-button-group", {
  variants: {
    orientation: {
      horizontal: "tiptap-button-group-horizontal",
      vertical: "tiptap-button-group-vertical",
    },
  },
  defaultVariants: {
    orientation: "horizontal",
  },
})

function ButtonGroup({
  className,
  orientation,
  ...props
}) {
  return (
    <div
      role="group"
      data-slot="tiptap-button-group"
      data-orientation={orientation}
      className={cn(buttonGroupVariants({ orientation }), className)}
      {...props} />
  );
}

function ButtonGroupText({
  className,
  render,
  ...props
}) {
  return useRender({
    defaultTagName: "div",
    props: mergeProps({ className: cn("tiptap-button-group-text", className) }, props),
    render,
    state: { slot: "tiptap-button-group-text" },
  });
}

function ButtonGroupSeparator({
  className,
  orientation = "vertical",
  ...props
}) {
  return (
    <Separator
      data-slot="tiptap-button-group-separator"
      orientation={orientation}
      className={cn("tiptap-button-group-separator", className)}
      {...props} />
  );
}

export {
  ButtonGroup,
  ButtonGroupSeparator,
  ButtonGroupText,
  buttonGroupVariants,
}
