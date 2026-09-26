import { Button as ButtonPrimitive } from "@base-ui/react/button";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "cn";
const buttonVariants = cva("button", {
  variants: {
    variant: { default: "button-primary", outline: "button-secondary", secondary: "button-secondary", ghost: "button-ghost", destructive: "button-danger", link: "button-link" },
    size: { default: "", xs: "", sm: "", lg: "", icon: "button-icon", "icon-xs": "button-icon", "icon-sm": "button-icon", "icon-lg": "button-icon" },
  }, defaultVariants: { variant: "default", size: "default" },
});
function Button({ className, variant, size, ...props }: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return <ButtonPrimitive data-slot="button" className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}
export { Button, buttonVariants };
