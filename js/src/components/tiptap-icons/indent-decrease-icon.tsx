import { memo } from "react"

type SvgProps = React.ComponentPropsWithoutRef<"svg">

export const IndentDecreaseIcon = memo(({ className, ...props }: SvgProps) => {
  return (
    <svg
      width="24"
      height="24"
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <path
        d="M9 18.5C9.55228 18.5 10 18.9477 10 19.5C10 20.0523 9.55228 20.5 9 20.5H3C2.44772 20.5 2 20.0523 2 19.5C2 18.9477 2.44772 18.5 3 18.5H9Z"
        fill="currentColor"
      />
      <path
        d="M20.293 8.29297C20.6835 7.90244 21.3165 7.90244 21.707 8.29297C22.0976 8.68349 22.0976 9.31651 21.707 9.70703L19.4141 12L21.707 14.293C22.0976 14.6835 22.0976 15.3165 21.707 15.707C21.3165 16.0976 20.6835 16.0976 20.293 15.707L17.293 12.707L17.2246 12.6309C16.9043 12.2381 16.9269 11.6591 17.293 11.293L20.293 8.29297Z"
        fill="currentColor"
      />
      <path
        d="M13 13.5C13.5523 13.5 14 13.9477 14 14.5C14 15.0523 13.5523 15.5 13 15.5H3C2.44772 15.5 2 15.0523 2 14.5C2 13.9477 2.44772 13.5 3 13.5H13Z"
        fill="currentColor"
      />
      <path
        d="M13 8.5C13.5523 8.5 14 8.94772 14 9.5C14 10.0523 13.5523 10.5 13 10.5H3C2.44772 10.5 2 10.0523 2 9.5C2 8.94772 2.44772 8.5 3 8.5H13Z"
        fill="currentColor"
      />
      <path
        d="M13 3.5C13.5523 3.5 14 3.94772 14 4.5C14 5.05228 13.5523 5.5 13 5.5H3C2.44772 5.5 2 5.05228 2 4.5C2 3.94772 2.44772 3.5 3 3.5H13Z"
        fill="currentColor"
      />
    </svg>
  )
})

IndentDecreaseIcon.displayName = "IndentDecreaseIcon"
