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
import Link from "next/link";
import type React from "react";
import { useState } from "react";

export type SubMenuItem = {
  title: string;
  link: string;
  icon?: React.ReactNode;
  onClick?: () => void;
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
  subs?: SubMenuItem[];
  addLabel?: string;
  onAdd?: () => void;
  manageLink?: string;
};

export default function DashboardNavigation({ routes }: { routes: Route[] }) {
  const { state } = useSidebar();
  const isCollapsed = state === "collapsed";
  const [openSet, setOpenSet] = useState<Set<string>>(new Set());

  return (
    <SidebarMenu>
      {routes.map((route) => {
        const isOpen = !isCollapsed && openSet.has(route.id);
        const hasSubRoutes = !!route.subs?.length;
        const useCollapsible = hasSubRoutes || !!route.onAdd;

        return (
          <SidebarMenuItem key={route.id}>
            {useCollapsible ? (
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
                                              isCollapsed && "justify-center"
                                            )} />}>{route.icon}{!isCollapsed && (
                                              <span className="ml-2 flex-1 text-sm font-medium">
                                                {route.title}
                                              </span>
                                            )}{!isCollapsed && hasSubRoutes && (
                                              <span>
                                                {isOpen ? (
                                                  <ChevronUp className="size-4" />
                                                ) : (
                                                  <ChevronDown className="size-4" />
                                                )}
                                              </span>
                                            )}</CollapsibleTrigger>

                {!isCollapsed && (
                  <CollapsibleContent>
                    <SidebarMenuSub className="my-1 ml-3.5">
                      {route.subs?.map((subRoute) => (
                        <SidebarMenuSubItem
                          key={`${route.id}-${subRoute.title}`}
                          className="h-auto"
                        >
                          <div className="group/sub relative flex items-center">
                            <SidebarMenuSubButton
                            render={
                              subRoute.onClick
                                ? <button
                                    type="button"
                                    onClick={subRoute.onClick}
                                    className="flex w-full items-center rounded-md px-4 py-1.5 text-sm font-medium text-muted-foreground hover:bg-sidebar-muted hover:text-foreground"
                                  />
                                : <Link href={subRoute.link} prefetch={true} className="flex items-center rounded-md px-4 py-1.5 text-sm font-medium text-muted-foreground hover:bg-sidebar-muted hover:text-foreground" />
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
                      ))}
                      {route.onAdd && (
                        <SidebarMenuSubItem>
                          <button
                            type="button"
                            onClick={route.onAdd}
                            className="flex w-full items-center gap-2 rounded-md px-4 py-1.5 text-sm font-medium text-muted-foreground hover:bg-sidebar-muted hover:text-foreground"
                          >
                            <Plus className="size-3.5" />
                            {route.addLabel ?? "Add"}
                          </button>
                        </SidebarMenuSubItem>
                      )}
                      {route.manageLink && (
                        <SidebarMenuSubItem>
                          <Link
                            href={route.manageLink}
                            className="flex w-full items-center gap-2 rounded-md px-4 py-1.5 text-sm font-medium text-muted-foreground hover:bg-sidebar-muted hover:text-foreground"
                          >
                            <LayoutGrid className="size-3.5" />
                            Manage
                          </Link>
                        </SidebarMenuSubItem>
                      )}
                    </SidebarMenuSub>
                  </CollapsibleContent>
                )}
              </Collapsible>
            ) : (
              <SidebarMenuButton tooltip={route.title} render={<Link href={route.link} prefetch={true} className={cn(
                                            "flex items-center rounded-lg px-2 transition-colors text-muted-foreground hover:bg-sidebar-muted hover:text-foreground",
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
