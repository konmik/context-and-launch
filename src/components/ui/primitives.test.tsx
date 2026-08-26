import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "~/test-render.js";
import { DialogRoot } from "./dialog.js";
import { MenuContent, MenuItem, MenuRoot, MenuTrigger } from "./menu.js";
import { TabsContent, TabsList, TabsRoot, TabsTrigger } from "./tabs.js";
import { FloatingWindow } from "./floating-panel.js";

afterEach(cleanup);

describe("local UI primitives", () => {
	it("anchors the southeast resize control to the window's right corner", () => {
		render(() => <FloatingWindow open><div>Window</div></FloatingWindow>);
		const handle = document.querySelector<HTMLElement>('[data-part="resize-trigger"]')!;

		expect(getComputedStyle(handle).position).toBe("absolute");
		expect(getComputedStyle(handle).right).toBe("0px");
		expect(getComputedStyle(handle).bottom).toBe("0px");
	});

  it("dismisses a dialog from a pointer press on its outside positioner", () => {
    const close = vi.fn();
    render(() => <DialogRoot open onOpenChange={close}><button>Inside</button></DialogRoot>);

    fireEvent.pointerDown(document.querySelector('[data-part="positioner"]')!);

    expect(close).toHaveBeenCalledWith(false);
  });

  it("does not dismiss when a pointer press starts inside and its click ends outside", () => {
    const close = vi.fn();
    render(() => <DialogRoot open onOpenChange={close}><button>Inside</button></DialogRoot>);
    const positioner = document.querySelector('[data-part="positioner"]')!;
    const inside = document.querySelector('[data-part="content"] button')!;

    fireEvent.pointerDown(inside);
    fireEvent.pointerUp(positioner);
    fireEvent.click(positioner);

    expect(close).not.toHaveBeenCalled();
  });

  it("portals a positioned menu and restores focus after selection", async () => {
    const view = render(() => (
      <div data-testid="owner">
        <MenuRoot trigger={<MenuTrigger>Open</MenuTrigger>}>
          <MenuContent><MenuItem>Choice</MenuItem></MenuContent>
        </MenuRoot>
      </div>
    ));
    const trigger = view.getByRole("button", { name: "Open" });
    fireEvent.click(trigger);
    await Promise.resolve();
    const menu = document.querySelector<HTMLElement>('[role="menu"]')!;

    expect(menu.parentElement).toBe(document.body);
    expect(menu.style.position).toBe("fixed");
    fireEvent.click(menu.querySelector('[role="menuitem"]')!);
    await Promise.resolve();
    expect(document.activeElement).toBe(trigger);
  });

  it("supports Home and End tab navigation", () => {
    const change = vi.fn();
    const view = render(() => (
      <TabsRoot value="first" onValueChange={change}>
        <TabsList><TabsTrigger value="first">First</TabsTrigger><TabsTrigger value="last">Last</TabsTrigger></TabsList>
        <TabsContent value="first">Content</TabsContent>
      </TabsRoot>
    ));

    fireEvent.keyDown(view.getByRole("tab", { name: "First" }), { key: "End" });

    expect(change).toHaveBeenCalledWith({ value: "last" });
  });
});
