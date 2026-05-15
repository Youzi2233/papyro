import { memo } from "react"
import { PaintBucket } from "lucide-react"

type SvgProps = React.ComponentPropsWithoutRef<"svg">

export const PaintBucketIcon = memo(({ className, ...props }: SvgProps) => {
  return (
    <PaintBucket
      aria-hidden="true"
      className={className}
      strokeWidth={1.8}
      {...props}
    />
  )
})

PaintBucketIcon.displayName = "PaintBucketIcon"
