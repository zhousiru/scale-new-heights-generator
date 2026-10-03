import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import type { ButtonHTMLAttributes } from 'react'
import { cn } from '../utils/cn'

const buttonVariants = cva('ui-button', {
  variants: {
    variant: {
      default: 'ui-button-default',
      secondary: 'ui-button-secondary',
      ghost: 'ui-button-ghost',
    },
    size: {
      default: 'ui-button-md',
      sm: 'ui-button-sm',
      icon: 'ui-button-icon',
    },
    active: {
      true: 'ui-button-active',
      false: '',
    },
  },
  defaultVariants: {
    variant: 'default',
    size: 'default',
    active: false,
  },
})

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
  VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

export function Button({
  className,
  variant,
  size,
  active,
  asChild,
  ...props
}: ButtonProps) {
  const Comp = asChild ? Slot : 'button'
  return (
    <Comp
      className={cn(buttonVariants({ variant, size, active }), className)}
      {...props}
    />
  )
}
