Run tests using benchmark script, optimize all tests until they run at most 3s in isolation.

Check for opportunities to optimize faster tests too.

Commit after each successful optimization, otherwise discard the theory and move on. Do not add code if the optimization resulted in no measurable improvements.