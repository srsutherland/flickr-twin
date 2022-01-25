import { FlickrAPI } from "./FlickrAPI.js"

/**
 * 
 */
 export class FlickrAPIQueue extends FlickrAPI {
    /**
     * Create the api wrapper
     * @param {string} api_key - (optional) If omitted, attempts to read saved value from localstorage 
     */
    constructor(api_key) {
        if (api_key instanceof FlickrAPI) {
            api_key = api_key.api_key
        }
        super(api_key)
        this.queue = [];
        this.waitingForLimit = false;
        this.waitingForTimer = false;
    }

    /**
     * Return the string representation of the object, e.g.
     * "83a16800e347e711938a038fd642fc2d": Used 1/3500 calls this hour. Oldest call expires in 00:42:42
     * @returns {string}
     */
    toString() {
        if (this.api_key) {
            return super.toString() + `; ${this.queue.length} items in queue`;
        } else {
            return "No API key set";
        }
    }

    async fetchJSON(rest_url) {
        const resolver = {}
        let api_promise = new Promise((resolve, reject) => {
            resolver.resolve = resolve
            resolver.reject = reject
        }).then(() => super.fetchJSON(rest_url), () => {})
        this.queue.push(resolver);
        this.updateQueue();
        return api_promise;
    }

    updateQueue(clearTimer = false) {
        if (clearTimer) {
            this.waitingForTimer = false;
        }
        if (this.queue.length <= 0) {
            return;
        }
        if (!this.waitingForTimer) {
            const calls = this.getNumberOfAPICalls()
            if (calls < this.max) {
                this.waitingForLimit = false;
                this.waitingForTimer = Date.now()
                window.setTimeout(() => this.updateQueue(true), 10)
                this.queue.shift().resolve()
            } else {
                this.waitingForLimit = Date.now()
                window.setTimeout(() => this.updateQueue(), 60000)
            }
        }
    }

    clearQueue() {
        while (this.queue.length > 0) {
            this.queue.pop().reject();
        }
    }
}