'use strict';

// eslint-disable-next-line no-unused-vars
class FlickrAPI {
    constructor(api_key) {
        if (api_key) {
            this.setAPIKey(api_key);
        } else if (window.localStorage["api_key"]) {
            this.api_key = window.localStorage["api_key"];
        }
        if (window.localStorage["call_history"]) {
            this.call_history = JSON.parse(window.localStorage["call_history"]);
        } else {
            this.call_history = [];
        }
    }

    toString() {
        if (this.api_key) {
            const calls = this.getNumberOfAPICalls();
            let returnValue = `"${this.api_key}": Used ${calls}/3500 calls this hour.`;
            if (calls > 0) {
                const ms_until_call_expires = this.call_history[0] + 60 * 60 * 1000 - Date.now();
                const time_formatted = new Date(ms_until_call_expires).toISOString().substr(11, 8);
                returnValue += ` Oldest call expires in ${time_formatted}`;
            }
            return returnValue;
        } else {
            return "No API key set";
        }
    }

    log() {
        console.log(this.toString());
    }

    setAPIKey(api_key) {
        this.api_key = api_key;
        window.localStorage["api_key"] = api_key;
    }

    getNumberOfAPICalls() {
        const one_hour_ago = Date.now() - 60 * 60 * 1000;
        while (this.call_history[0] < one_hour_ago) {
            this.call_history.shift();
        }
        return this.call_history.length;
    }

    useAPI() {
        if (!(this.api_key && this.api_key.length > 5)) {
            throw new Error("No API key set");
        }
        if (this.getNumberOfAPICalls() > 3500) {
            throw new Error("Exceeded API limit for this key");
        }
        this.call_history.push(Date.now());
        window.localStorage["call_history"] = JSON.stringify(this.call_history);
    }

    async getImageFavorites(photo_id, page = 1) {
        this.useAPI();
        const baseurl = "https://www.flickr.com/services/rest/?format=json&nojsoncallback=1";
        const method = "&method=flickr.photos.getFavorites&per_page=50";
        const rest_url = `${baseurl}${method}&photo_id=${photo_id}&page=${page}&api_key=${this.api_key}`;
        const rest_response = await fetch(rest_url);
        const response_json = await rest_response.json(); //extract JSON from the http response
        return response_json;
    }

    async getUserFavorites(user_id, page = 1) {
        this.useAPI();
        const baseurl = "https://www.flickr.com/services/rest/?format=json&nojsoncallback=1";
        const method = "&method=flickr.favorites.getPublicList&per_page=500";
        const rest_url = `${baseurl}${method}&user_id=${user_id}&page=${page}&api_key=${this.api_key}`;
        const rest_response = await fetch(rest_url);
        const response_json = await rest_response.json(); //extract JSON from the http response
        return response_json;
    }

    async getPhotoInfo(photo_id) {
        this.useAPI();
        const baseurl = "https://www.flickr.com/services/rest/?format=json&nojsoncallback=1";
        const method = "&method=flickr.photos.getInfo";
        const rest_url = `${baseurl}${method}&photo_id=${photo_id}&api_key=${this.api_key}`;
        const rest_response = await fetch(rest_url);
        const response_json = await rest_response.json(); //extract JSON from the http response
        return response_json;
    }
}