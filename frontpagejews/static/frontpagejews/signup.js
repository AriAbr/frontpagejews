// The email signup: a card that slides up once the visitor has scrolled half
// a screen, by when they've started reading, and the same form at the bottom
// of the page. Brevo keeps the addresses; each form is sent in the
// background and says how it went in place of itself. A note at the top says
// they're on the list when they come back from confirming by email.
//
// A script of its own rather than part of page.js, so the signup works even
// when the data doesn't load.
const signupCard = document.getElementById("signup-card");
const subscribedNotice = document.getElementById("subscribed-notice");
const bottomSignup = document.getElementById("signup");

// Closing the signup card, or signing up, keeps it from showing on later
// visits too. Where the browser blocks storage, it shows once per visit
// instead.
const SIGNUP_CARD_DISMISSED_KEY = "signup-card-dismissed";
let signupCardDismissed = readSignupCardDismissed();
let scrolledHalfAScreen = false;
// The signup card steps aside while the form at the bottom is in view, rather
// than show the same form twice.
let bottomSignupInView = false;

for (const form of document.querySelectorAll(".signup-form")) {
  form.addEventListener("submit", event => {
    event.preventDefault();
    submitSignup(form);
  });
}

signupCard.querySelector(".close").addEventListener("click", () => {
  signupCardDismissed = true;
  rememberSignupCardDismissed();
  updateSignupCard();
});

subscribedNotice.querySelector(".close").addEventListener("click", () => {
  subscribedNotice.hidden = true;
});

// Brevo sends people here with ?subscribed once they click the link in its
// confirmation email.
const params = new URLSearchParams(location.search);
if (params.has("subscribed")) {
  signupCardDismissed = true;
  rememberSignupCardDismissed();
  showSubscribed();
}

if (!signupCardDismissed) {
  const checkScroll = () => {
    if (scrollY < innerHeight / 2) return;
    scrolledHalfAScreen = true;
    removeEventListener("scroll", checkScroll);
    updateSignupCard();
  };
  addEventListener("scroll", checkScroll, { passive: true });
  new IntersectionObserver(entries => {
    bottomSignupInView = entries[0].isIntersecting;
    updateSignupCard();
  }).observe(bottomSignup);
}

function showSubscribed() {
  // Out of the address, so a reload or a shared link doesn't say it again.
  params.delete("subscribed");
  const query = params.toString();
  history.replaceState(null, "", location.pathname + (query ? `?${query}` : "") + location.hash);
  subscribedNotice.hidden = false;
  fadeOut(subscribedNotice, 6000);
}

// Fades a floating card out after `delay` milliseconds, then hides it.
function fadeOut(floatingCard, delay) {
  setTimeout(() => {
    floatingCard.classList.add("fading");
    // A timer rather than transitionend, which never fires where reduced
    // motion turns the transition off. The same length as the transition.
    setTimeout(() => {
      floatingCard.hidden = true;
    }, 600);
  }, delay);
}

function updateSignupCard() {
  signupCard.hidden = signupCardDismissed || !scrolledHalfAScreen || bottomSignupInView;
}

async function submitSignup(form) {
  const button = form.querySelector("button");
  const signupStatus = form.nextElementSibling;
  button.disabled = true;
  signupStatus.textContent = "Signing you up…";
  try {
    // isAjax makes Brevo answer with JSON rather than its own page. It answers
    // success for any address, so the email input's own check is the only one.
    const response = await fetch(`${form.action}?isAjax=1`, {
      method: "POST",
      body: new URLSearchParams(new FormData(form)),
    });
    const result = await response.json();
    if (!result.success) throw new Error("Brevo didn't save the signup");
    form.hidden = true;
    // Brevo adds the address once its owner clicks the link it emails them.
    signupStatus.textContent = "Almost done: check your inbox to confirm.";
    signupCardDismissed = true;
    rememberSignupCardDismissed();
    // The signup card stays long enough to read that before it goes.
    fadeOut(signupCard, signupCard.contains(form) ? 5000 : 0);
  } catch (error) {
    // Sentry, where the page has it, so a broken signup doesn't go unnoticed.
    window.Sentry?.captureException(error);
    signupStatus.textContent = "That didn't go through. Please try again.";
  } finally {
    button.disabled = false;
  }
}

function readSignupCardDismissed() {
  try {
    return localStorage.getItem(SIGNUP_CARD_DISMISSED_KEY) === "true";
  } catch {
    return false;
  }
}

function rememberSignupCardDismissed() {
  try {
    localStorage.setItem(SIGNUP_CARD_DISMISSED_KEY, "true");
  } catch {
    // Storage blocked: the signup card shows again next visit.
  }
}
