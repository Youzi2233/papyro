import { memo } from "react"
import { Grip } from "lucide-react"

type SvgProps = React.ComponentPropsWithoutRef<"svg">

export const Grip4Icon = memo(({ className, ...props }: SvgProps) => {
  return (
    <Grip
      aria-hidden="true"
      className={className}
      strokeWidth={1.8}
      {...props}
    />
  )
})

Grip4Icon.displayName = "Grip4Icon"
