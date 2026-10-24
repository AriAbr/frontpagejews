// The byline's Claude link: a dialog with a prompt for the visitor to copy into
// a new Claude chat, then a button to open one. Open Claude stays off until the
// prompt's copied, so a visitor doesn't land on an empty chat.
//
// Each step is counted in Google Analytics as an event of its own:
// claude_dialog_open, claude_prompt_copy and claude_chat_open.
//
// A script of its own rather than part of page.js, so it works even when the
// data doesn't load.
import { track } from "./analytics.js";

const dialog = document.getElementById("claude-dialog");
const promptBox = document.getElementById("claude-prompt");
const copyButton = document.getElementById("claude-copy");
const openButton = document.getElementById("claude-open");
// "Copied ✓" lasts a moment, then the button offers to copy again, so every
// click visibly does something.
let copyAgainTimer;

document.getElementById("claude-link").addEventListener("click", () => {
  showStep(copyButton);
  dialog.showModal();
  track("claude_dialog_open");
});

dialog.querySelector(".close").addEventListener("click", () => dialog.close());

// A click on the dimmed page around the dialog closes it too. Those clicks
// land on the dialog itself, but so do clicks on its padding, so it checks
// where the click was.
dialog.addEventListener("click", event => {
  const box = dialog.getBoundingClientRect();
  const inside = event.clientX >= box.left && event.clientX <= box.right
    && event.clientY >= box.top && event.clientY <= box.bottom;
  if (!inside) dialog.close();
});

// Where the browser won't allow copying, it selects the prompt instead, ready
// to copy by hand, and Open Claude comes on all the same.
copyButton.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(promptBox.textContent);
    copyButton.textContent = "Copied ✓";
    track("claude_prompt_copy");
    clearTimeout(copyAgainTimer);
    copyAgainTimer = setTimeout(() => (copyButton.textContent = "Copy again"), 2000);
  } catch {
    getSelection().selectAllChildren(promptBox);
  }
  showStep(openButton);
  openButton.focus();
});

openButton.addEventListener("click", () => {
  window.open("https://claude.ai/new", "_blank", "noopener");
  track("claude_chat_open");
});

// Makes `step` the next one, in orange: the copy button when the dialog
// opens, Open Claude once the prompt's copied.
function showStep(step) {
  copyButton.classList.toggle("next", step === copyButton);
  openButton.classList.toggle("next", step === openButton);
  openButton.disabled = step === copyButton;
  if (step === copyButton) {
    clearTimeout(copyAgainTimer);
    copyButton.textContent = "Copy prompt";
  }
}
