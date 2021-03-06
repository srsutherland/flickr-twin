import Controller from "./Controller.js";

export const c = new Controller();
globalThis.c = c
c.api.log()

document.addEventListener("DOMContentLoaded", () => {
    c.r.renderParent = document.getElementById("main");

    const apiInfo = document.getElementById("api-log");
    globalThis.logTimer = setInterval(() => { apiInfo.textContent = c.api.toString() }, 1000);
    apiInfo.textContent = c.api.toString();
    if (window.localStorage.uid) {
        document.getElementById("user-id-input").value = window.localStorage.uid;
    }
    
    function connectButton(id, func) {
        document.getElementById(id).addEventListener('click', func)
    }

    function readUID() {
        const uid = document.getElementById("user-id-input").value;
        window.localStorage.uid = uid;
        return uid;
    }

    /* Main Control */

    connectButton("find-user-twins", async () => {
        await c.processPhotosFromUser(readUID());
        c.r.displayTwins();
    })

    connectButton("show-most-popular", async () => {
        await c.processUsersFromDB();
        c.r.displayImages();
    })

    connectButton("set-api-key", () => {
        const key = document.getElementById("api-key-input").value;
        c.api.setAPIKey(key);
    })

    /* Advanced */

    for (const b of document.querySelectorAll(".collapse-button")) {
        b.addEventListener("click", () => {
            const p = b.parentElement;
            if (p.classList.contains("collapsed")) {
                p.classList.remove("collapsed")
            } else {
                p.classList.add("collapsed")
            }
        })
    }

    connectButton("display-user-faves", async () => { c.r.displayImagesByIDs(await c.loadUserFavorites(readUID())) })
    connectButton("process-user-faves", () => { c.processPhotosFromUser(readUID()) })
    connectButton("display-twins",      () => { c.r.displayTwins() })
    connectButton("process-twins",      () => { c.processUsersFromDB() })
    connectButton("display-images",     () => { c.r.displayImages() })
})