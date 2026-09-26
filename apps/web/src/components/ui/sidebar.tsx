"use client";
import * as React from "react";
import { useRender } from "@base-ui/react/use-render";
import { mergeProps } from "@base-ui/react/merge-props";
import { PanelLeftIcon } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { Button } from "./button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "./sheet";

type Context = { open: boolean; setOpen: React.Dispatch<React.SetStateAction<boolean>>; openMobile: boolean; setOpenMobile: React.Dispatch<React.SetStateAction<boolean>>; toggleSidebar: () => void; isMobile: boolean };
const SidebarContext = React.createContext<Context | null>(null);
function useSidebar() { const context = React.useContext(SidebarContext); if (!context) throw new Error("Sidebar requires a provider."); return context; }
function SidebarProvider({ children, defaultOpen = true, ...props }: React.ComponentProps<"div"> & { defaultOpen?: boolean }) {
  const [open, setOpen] = React.useState(defaultOpen);
  const [openMobile, setOpenMobile] = React.useState(false);
  const isMobile = useIsMobile();
  const toggleSidebar = React.useCallback(() => { if (isMobile) setOpenMobile(v => !v); else setOpen(v => !v); }, [isMobile]);
  return <SidebarContext.Provider value={{ open, setOpen, openMobile, setOpenMobile, isMobile, toggleSidebar }}><div data-slot="sidebar-wrapper" {...props}>{children}</div></SidebarContext.Provider>;
}
function Sidebar({ children, collapsible: _collapsible, ...props }: React.ComponentProps<"div"> & { collapsible?: string }) {
  const { isMobile, open, openMobile, setOpenMobile } = useSidebar();
  if (isMobile) return <Sheet open={openMobile} onOpenChange={setOpenMobile}><SheetContent side="left" data-slot="sidebar" data-mobile="true"><SheetHeader className="sr-only"><SheetTitle>Navigation</SheetTitle><SheetDescription>Kanoki pages.</SheetDescription></SheetHeader><div {...props}>{children}</div></SheetContent></Sheet>;
  return <aside data-slot="sidebar" hidden={!open} {...props}>{children}</aside>;
}
function SidebarTrigger({ onClick, ...props }: React.ComponentProps<typeof Button>) { const { toggleSidebar } = useSidebar(); return <Button variant="ghost" size="icon" {...props} onClick={e => { onClick?.(e); toggleSidebar(); }}><PanelLeftIcon aria-hidden="true" /><span className="sr-only">Toggle navigation</span></Button>; }
function SidebarInset(props: React.ComponentProps<"main">) { return <main data-slot="sidebar-inset" {...props} />; }
function SidebarHeader(props: React.ComponentProps<"div">) { return <div data-slot="sidebar-header" {...props} />; }
function SidebarContent(props: React.ComponentProps<"div">) { return <div data-slot="sidebar-content" {...props} />; }
function SidebarFooter(props: React.ComponentProps<"div">) { return <div data-slot="sidebar-footer" {...props} />; }
function SidebarGroup(props: React.ComponentProps<"div">) { return <div data-slot="sidebar-group" {...props} />; }
function SidebarGroupContent(props: React.ComponentProps<"div">) { return <div data-slot="sidebar-group-content" {...props} />; }
function SidebarMenu(props: React.ComponentProps<"ul">) { return <ul data-slot="sidebar-menu" {...props} />; }
function SidebarMenuItem(props: React.ComponentProps<"li">) { return <li data-slot="sidebar-menu-item" {...props} />; }
function SidebarMenuButton({ render, isActive, ...props }: useRender.ComponentProps<"button"> & { isActive?: boolean }) { return useRender({ defaultTagName: "button", render, props: mergeProps<"button">({ type: "button", "data-slot": "sidebar-menu-button", "data-active": isActive } as React.ComponentProps<"button">, props) }); }
export { Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent, SidebarHeader, SidebarInset, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarProvider, SidebarTrigger, useSidebar };
