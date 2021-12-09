import { Renderer } from "./Renderer.js"

/**
 * Used to track and display progress of long controller methods
 */
 export class Progress {
    constructor() {
        this.total_inputs = 0;
        this.inputs_processed = 0;
        this.total_pages = 0;
        this.pages_processed = 0;
        this.duplicates = 0;
        this.errors = 0;
        this.awaited = [];
        this.awaitedSub = [];
        this.deferred = [];
    }

    /**
     * Set the renderer that gets called on log()
     * @param {Renderer} renderer_object 
     * @returns {Progress} - a reference to this object
     */
    renderWith(renderer_object) {
        this.renderer = renderer_object;
        return this;
    }

    toString() {
        const dups = this.duplicates ? `, ${this.duplicates} dups` : "";
        const errs = this.errors ? `, ${this.errors} errs` : "";
        return `${this.inputs_processed}/${this.total_inputs} : ${this.pages_processed}/${this.total_pages}${dups}${errs}`;
    }

    /**
     * Logs the status to the console, or if the renderer is set, tells it to redraw the progress bar
     * @param {string} msg - additional message to display
     */
    log(msg) {
        if (this.renderer instanceof Renderer) {
            let percentage = 100 * (this.pages_processed + this.errors) / this.total_pages;
            this.renderer.displayProgress(percentage, this.toString());
        }
        if (!this.renderer || window.verbose_mode) {
            if (msg) {
                console.log("%s (%s)", this.toString(), msg);
            } else {
                console.log(this.toString());
            }
        }
    }

    /**
     * Called when a primary request is completed
     * @param {string} msg - additional message to display
     */
    update(msg) {
        this.inputs_processed += 1;
        this.pages_processed += 1;
        this.log(msg)
        this.checkDeferred()
    }

    /**
     * Called when a subpage request is completed
     * @param {string} msg - additional message to display
     */
    subUpdate(msg) {
        this.pages_processed += 1;
        this.log(msg)
        this.checkDeferred()
    }

    /**
     * Indicate that an item is a duplicate and will not be processed,
     * so remove it from the progress total
     * @param {string} input_id - id of the duplicate item
     */
    duplicate(input_id) {
        this.duplicates += 1;
        this.total_inputs -= 1;
        this.total_pages -= 1;
        if (input_id) {
            console.warn(`${input_id} already processed`);
        }
        this.checkDeferred()
    }

    /**
     * Called on error processing an item
     * @param {string} input_id - id of the item causing the error
     * @param {string} msg - additional message to display, usually the original error message
     */
    error(input_id, msg = "") {
        this.errors += 1
        if (input_id) {
            console.error(`Error processing ${input_id}; ${msg}`);
        }
        this.log()
        this.checkDeferred()
    }

    /**
     * Collects promises from primary api calls
     * @param {Promise} promise 
     */
    await(promise, updateMsg) {
        this.total_inputs += 1
        this.total_pages += 1
        this.awaited.push(promise)
        return promise.then(() => this.update(updateMsg))
    }

    /**
     * Collects promises from secondary api calls
     * @param {Promise} promise 
     */
    awaitSub(promise, updateMsg) {
        this.total_pages += 1
        this.awaitedSub.push(promise)
        return promise.then(() => this.subUpdate(updateMsg))
    }

    /**
     * @returns {Promise} - Resolves when all collected api call promises have resolved/failed
     */
    async allSettled() {
        // Wait for all the page 1's...
        await Promise.allSettled(this.awaited)
        // ...and then for all the other pages
        await Promise.allSettled(this.awaitedSub)
    }

    /**
     * Log that the task has been completed
     */
    done() {
        let msg = `Done. Processed ${this.inputs_processed}/${this.total_inputs} items over ${this.pages_processed} requests`
        if (this.duplicates) {
            msg += ` with ${this.duplicates} duplicates`
        }
        if (this.errors) {
            const prefix = this.duplicates ? "and" : "with"
            msg += ` ${prefix} ${this.errors} errors`
        }
        console.log(msg + ".");
    }

    /**
     * Defer until the number of queued items left to process are less than the target
     * @param {number} remaining - number of api calls remaining to defer until 
     */
    async waitForProgress(remaining) {
        //this whole thing is a bit of an ugly hack and I can't decide if I'm proud of it or not
        //definitely want to revisit it later though
        var deferred = {
            promise: null,
            check: null,
            resolved: false
        };
        deferred.promise = new Promise((resolve) => {
            deferred.check = () => {
                if (this.total_pages - (this.pages_processed + this.errors) < remaining) {
                    deferred.resolved = true; 
                    resolve()
                }
            };
        });
        this.deferred.push(deferred)

        await deferred.promise
    }

    /**
     * Check which deferred blocking conditions can be released
     */
    checkDeferred() {
        for (const d of this.deferred) {
            d.check()
        }
        this.deferred = this.deferred.filter(d => !d.resolved)
    }
}

export default Progress