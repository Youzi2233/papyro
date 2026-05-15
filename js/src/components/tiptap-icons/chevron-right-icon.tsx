import { memo } from "react"
import { ChevronRight } from "lucide-react"

type SvgProps = React.ComponentPropsWithoutRef<"svg">

export const ChevronRightIcon = memo(({ className, ...props }: SvgProps) => {
  return (
    <ChevronRight
      aria-hidden="true"
      className={className}
      strokeWidth={1.9}
      {...props}
    />
  )
})

ChevronRightIcon.displayName = "ChevronRightIcon"
