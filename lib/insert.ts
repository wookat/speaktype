type TextTarget = HTMLInputElement | HTMLTextAreaElement | HTMLElement;

const TEXT_INPUT_TYPES = new Set(["text", "search", "url", "email", "tel", "password", ""]);

export function isEditable(el: Element | null): el is TextTarget {
  if (!el || !(el instanceof HTMLElement)) return false;
  if (el instanceof HTMLTextAreaElement) return !el.disabled && !el.readOnly;
  if (el instanceof HTMLInputElement) {
    return !el.disabled && !el.readOnly && TEXT_INPUT_TYPES.has(el.type);
  }
  return el.isContentEditable;
}

/** 找到当前应该落字的目标：优先真实焦点元素，其次记住的上一个可编辑元素 */
export function resolveTarget(remembered: TextTarget | null): TextTarget | null {
  const active = document.activeElement;
  if (isEditable(active)) return active;
  if (remembered && remembered.isConnected && isEditable(remembered)) return remembered;
  return null;
}

export function readSelection(target: TextTarget | null): string {
  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
    const { selectionStart, selectionEnd, value } = target;
    if (selectionStart !== null && selectionEnd !== null && selectionEnd > selectionStart) {
      return value.slice(selectionStart, selectionEnd);
    }
    return "";
  }
  return (window.getSelection()?.toString() ?? "").trim();
}

/**
 * 在光标处插入文本。
 * input/textarea 用 setRangeText + input 事件（React 等框架靠 input 事件同步 state）；
 * contenteditable 走 execCommand('insertText')，这是各类富文本编辑器（含 Slate/ProseMirror）兼容性最好的方式。
 */
export function insertText(target: TextTarget, text: string): boolean {
  if (!text) return false;
  target.focus();

  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
    const start = target.selectionStart ?? target.value.length;
    const end = target.selectionEnd ?? target.value.length;
    target.setRangeText(text, start, end, "end");
    target.dispatchEvent(new InputEvent("input", { bubbles: true, data: text, inputType: "insertText" }));
    target.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  }

  if (target.isContentEditable) {
    const ok = document.execCommand("insertText", false, text);
    if (ok) return true;
    const selection = window.getSelection();
    const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
    if (range) {
      range.deleteContents();
      range.insertNode(document.createTextNode(text));
      range.collapse(false);
    } else {
      target.append(document.createTextNode(text));
    }
    target.dispatchEvent(new InputEvent("input", { bubbles: true, data: text, inputType: "insertText" }));
    return true;
  }
  return false;
}

export type { TextTarget };
