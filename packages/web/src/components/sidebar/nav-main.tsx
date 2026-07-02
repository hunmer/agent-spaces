"use client";

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuItem as SidebarMenuSubItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";
import { ChevronDown, ChevronUp, MoreHorizontal, Plus, LayoutGrid } from "lucide-react";
import { useTranslations } from "next-intl";
import type React from "react";
import { useState } from "react";
import { tauriNavigate } from "@/lib/navigate";
import { useRouter } from "next/navigation";

export type SubMenuItem = {
  title: string;
  link: string;
  icon?: React.ReactNode;
  onClick?: () => void;
  closeParentOnClick?: boolean;
  menuItems?: {
    label: string;
    icon?: React.ReactNode;
    variant?: "default" | "destructive";
    onClick: () => void;
  }[];
};

export type Route = {
  id: string;
  title: string;
  icon?: React.ReactNode;
  link: string;
  onClick?: () => void;
  subs?: SubMenuItem[];
  addLabel?: string;
  onAdd?: () => void;
  manageLink?: string;
};

export default function DashboardNavigation({ routes, pathname }: { routes: Route[]; pathname?: string }) {
  const { state, isMobile, setOpenMobile } = useSidebar();
  const isCollapsed = state === "collapsed";
  const [openSet, setOpenSet] = useState<Set<string>>(new Set());
  const router = useRouter();
  const tc = useTranslations('common');

  const navigate = (href: string) => {
    if (isMobile) setOpenMobile(false);
    tauriNavigate(router, href);
  };

  return (
    <SidebarMenu>
      {routes.map((route) => {
        const isOpen = !isCollapsed && openSet.has(route.id);
        const hasSubRoutes = !!route.subs?.length;
        const useCollapsible = hasSubRoutes || !!route.onAdd;

        return (
          <SidebarMenuItem key={route.id}>
            {useCollapsible ? (
              isCollapsed ? (
                <CollapsedRoutePopover
                  route={route}
                  pathname={pathname}
                  navigate={navigate}
                  tc={tc}
                />
              ) : (
                <Collapsible
                  open={isOpen}
                  onOpenChange={(open) =>
                    setOpenSet((prev) => {
                      const next = new Set(prev);
                      if (open) next.add(route.id);
                      else next.delete(route.id);
                      return next;
                    })
                  }
                  className="w-full"
                >
                  <CollapsibleTrigger render={<SidebarMenuButton className={cn(
                    "group/hdr flex flex-1 items-center rounded-lg px-2 transition-colors",
                    isOpen
                      ? "bg-sidebar-muted text-foreground"
                      : "text-muted-foreground hover:bg-sidebar-muted hover:text-foreground",
                  )} />}>{route.icon}{
                      <span className="ml-2 flex-1 text-sm font-medium">
                        {route.title}
                      </span>
                    }{hasSubRoutes && (
                      <span>
                        {isOpen ? (
                          <ChevronUp className="size-4" />
                        ) : (
                          <ChevronDown className="size-4" />
                        )}
                      </span>
                    )}</CollapsibleTrigger>

                  <CollapsibleContent>
                    <SidebarMenuSub className="my-1 ml-3.5">
                      {route.subs?.map((subRoute) => {
                        const handleSubClick = () => {
                          if (subRoute.closeParentOnClick !== false) {
                            setOpenSet((prev) => {
                              const next = new Set(prev);
                              next.delete(route.id);
                              return next;
                            });
                          }
                          if (subRoute.onClick) subRoute.onClick();
                          else navigate(subRoute.link);
                        };
                        return (
                        <SidebarMenuSubItem
                          key={`${route.id}-${subRoute.title}`}
                          className="h-auto"
                        >
                          <div className="group/sub relative flex items-center">
                            <SidebarMenuSubButton
                              render={
                                <button
                                  type="button"
                                  onClick={handleSubClick}
                                  className={cn(
                                    "flex w-full items-center rounded-md px-4 py-1.5 text-sm font-medium cursor-pointer",
                                    pathname === subRoute.link
                                      ? "bg-sidebar-accent text-sidebar-accent-foreground"
                                      : "text-muted-foreground hover:bg-sidebar-muted hover:text-foreground",
                                  )}
                                />
                              }
                            >{subRoute.title}</SidebarMenuSubButton>

                            {subRoute.menuItems && subRoute.menuItems.length > 0 && (
                              <DropdownMenu>
                                <DropdownMenuTrigger
                                  className="absolute right-1 flex items-center justify-center rounded-md p-0.5 opacity-0 group-hover/sub:opacity-100 hover:bg-sidebar-muted transition-opacity cursor-pointer"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <MoreHorizontal className="size-3.5 text-muted-foreground" />
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" side="right">
                                  {subRoute.menuItems.map((item) => (
                                    <DropdownMenuItem
                                      key={item.label}
                                      variant={item.variant}
                                      onClick={item.onClick}
                                    >
                                      {item.icon}
                                      {item.label}
                                    </DropdownMenuItem>
                                  ))}
                                </DropdownMenuContent>
                              </DropdownMenu>
                            )}
                          </div>
                        </SidebarMenuSubItem>
                        );
                      })}
                      {route.onAdd && (
                        <SidebarMenuSubItem>
                          <button
                            type="button"
                            onClick={route.onAdd}
                            className="flex w-full items-center gap-2 rounded-md px-4 py-1.5 text-sm font-medium text-muted-foreground hover:bg-sidebar-muted hover:text-foreground cursor-pointer"
                          >
                            <Plus className="size-3.5" />
                            {route.addLabel ?? tc('add')}
                          </button>
                        </SidebarMenuSubItem>
                      )}
                      {route.manageLink && (
                        <SidebarMenuSubItem>
                          <button
                            type="button"
                            onClick={() => navigate(route.manageLink!)}
                            className="flex w-full items-center gap-2 rounded-md px-4 py-1.5 text-sm font-medium text-muted-foreground hover:bg-sidebar-muted hover:text-foreground cursor-pointer"
                          >
                            <LayoutGrid className="size-3.5" />
                            {tc('manage')}
                          </button>
                        </SidebarMenuSubItem>
                      )}
                    </SidebarMenuSub>
                  </CollapsibleContent>
                </Collapsible>
              )
            ) : (
              <SidebarMenuButton tooltip={route.title} render={<button type="button" onClick={() => route.onClick ? route.onClick() : navigate(route.link)} className={cn(
                "flex items-center rounded-lg px-2 transition-colors cursor-pointer text-muted-foreground hover:bg-sidebar-muted hover:text-foreground",
                isCollapsed && "justify-center"
              )} />}>{route.icon}{!isCollapsed && (
                <span className="ml-2 text-sm font-medium">
                  {route.title}
                </span>
              )}</SidebarMenuButton>
            )}
          </SidebarMenuItem>
        );
      })}
    </SidebarMenu>
  );
}

function CollapsedRoutePopover({
  route,
  pathname,
  navigate,
  tc,
}: {
  route: Route;
  pathname?: string;
  navigate: (href: string) => void;
  tc: (key: string) => string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger render={<SidebarMenuButton className="justify-center text-muted-foreground hover:bg-sidebar-muted hover:text-foreground" tooltip={route.title} />}>{route.icon}</PopoverTrigger>
      <PopoverContent side="right" sideOffset={8} className="w-56 p-1.5">
        <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground mb-1">{route.title}</div>
        {route.subs?.map((subRoute) => {
          const handleSubClick = () => {
            setOpen(false);
            if (subRoute.onClick) subRoute.onClick();
            else navigate(subRoute.link);
          };
          return (
            <div key={`${route.id}-${subRoute.title}`} className="group/sub relative flex items-center">
              <button
                type="button"
                onClick={handleSubClick}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm cursor-pointer",
                  pathname === subRoute.link
                    ? "bg-accent text-accent-foreground font-medium"
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                )}
              >
                {subRoute.icon}
                {subRoute.title}
              </button>
              {subRoute.menuItems && subRoute.menuItems.length > 0 && (
                <DropdownMenu>
                  <DropdownMenuTrigger
                    className="absolute right-1 flex items-center justify-center rounded-md p-0.5 opacity-0 group-hover/sub:opacity-100 hover:bg-accent transition-opacity cursor-pointer"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <MoreHorizontal className="size-3.5 text-muted-foreground" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" side="right">
                    {subRoute.menuItems.map((item) => (
                      <DropdownMenuItem
                        key={item.label}
                        variant={item.variant}
                        onClick={item.onClick}
                      >
                        {item.icon}
                        {item.label}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          );
        })}
        {route.onAdd && (
          <button
            type="button"
            onClick={() => { setOpen(false); route.onAdd?.(); }}
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground mt-0.5 cursor-pointer"
          >
            <Plus className="size-3.5" />
            {route.addLabel ?? tc('add')}
          </button>
        )}
        {route.manageLink && (
          <button
            type="button"
            onClick={() => { setOpen(false); navigate(route.manageLink!); }}
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground mt-0.5 cursor-pointer"
          >
            <LayoutGrid className="size-3.5" />
            {tc('manage')}
          </button>
        )}
      </PopoverContent>
    </Popover>
  );
}
