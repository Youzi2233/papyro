import { memo } from "react"
import { Plus } from "lucide-react"

type SvgProps = React.ComponentPropsWithoutRef<"svg">

export const PlusSmallIcon = memo(({ className, ...props }: SvgProps) => {
  return (
    <Plus
      aria-hidden="true"
      className={className}
      strokeWidth={2}
      {...props}
    />
  )
})

PlusSmallIcon.displayName = "PlusSmallIcon"
