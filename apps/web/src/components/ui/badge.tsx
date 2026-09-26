import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "cn";
const badgeVariants = cva("status-pill", { variants: { variant: {
  default: "status-active", secondary: "status-neutral", destructive: "status-revoked", outline: "status-neutral", ghost: "status-neutral", link: "status-neutral",
} }, defaultVariants: { variant: "default" } });
function Badge({ className, variant = "default", render, ...props }: useRender.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return useRender({ defaultTagName: "span", props: mergeProps<"span">({ className: cn(badgeVariants({ variant }), className) }, props), render, state: { slot: "badge", variant } });
}
export { Badge, badgeVariants };
