Viewed e2e-output.json:1-24

This is a solid list of findings for Story 2.4. This story is all about **Resiliency**—making sure our connection to the AI doesn't just work, but stays working even when the internet or the API gets cranky.


### 🛠️ The Actionable Patches (Fix these now)

"I'll take the logic bugs. 
*   **ID 2 (Dead Code):** This is a classic 'oops.' In your loop, you have a line that throws an error at the very end, but the code *above* it already throws an error first. It’s like having a 'Do Not Enter' sign *behind* a brick wall—you’ll never actually reach it. It doesn't break the app, but it's messy code that should be cleaned up.
*   **ID 4 (Fragile Parsing):** This is about being careful with types. If you try to turn an empty string into a number in JavaScript, it becomes `0`. We want to be more precise so we don't accidentally treat a weird empty response as a 'Status Code 0' and do something unexpected."

"**ID 1 (Missing Retry Jitter)** is a big one for me. Without 'Jitter,' if the API goes down and then comes back up, every single one of our failed requests will try to reconnect at the *exact same millisecond*. This is called a **Thundering Herd**. It can actually crash the server we're trying to talk to! 'Jitter' just means adding a tiny bit of random time (like +/- 100ms) to each retry so the requests spread out naturally."

"**ID 3 (HTTP-Date Support)** is about following the 'rules of the internet' (RFC 7231). When a server says 'Wait before retrying,' it can say 'Wait 30 seconds' OR it can say 'Wait until Wednesday at 4 PM.' Right now, our code only understands the '30 seconds' version. If the AI gives us a specific date and time, we’ll ignore it and might try again too soon, getting ourselves blocked."

***

### ⏳ The Deferred Findings (Good to know, but skip for now)

"**ID 5 (Global Singleton):** We're using one single 'client' for the whole app. It works fine for this small project, but in a massive system, this makes it hard to test or to have different settings for different parts of the app. Since it's how the project was already built (pre-existing), the reviewer is letting us skip it for now."

"**ID 6 (Side-effect Logging):** Professional libraries shouldn't just shout `console.warn` whenever they feel like it; they should use a 'Logger' that the user can turn on or off. Again, for a CLI tool like this, it's fine to keep it simple and just use `console.warn` for now."

***

**Orchestrator Note:** 
In short: The "Patches" are about fixing a logic error (unreachable code), adding some randomness to retries so we don't overwhelm the server (Jitter), and making sure we understand all the ways the server tells us to 'Wait' (HTTP-Date). 

