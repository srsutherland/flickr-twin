import Controller from "./Controller.js";

export const c = new Controller();
globalThis.c = c
c.api.log()

document.addEventListener("DOMContentLoaded", () => {
    c.r.renderParent = document.getElementById("main")

    let apiInfo = document.getElementById("log")
    globalThis.logTimer = setInterval(() => { apiInfo.textContent = c.api.toString() }, 1000)
    apiInfo.textContent = c.api.toString()

    document.getElementById("process-user-faves").addEventListener('click', async () => {
        let uid = document.getElementById("user-id-input").value
        await c.processPhotosFromUser(uid)
        c.r.print_results()
    })

    document.getElementById("show-most-popular").addEventListener('click', async () => {
        await c.processUsersFromDB()
        c.r.displayImages()
    })

    document.getElementById("set-api-key").addEventListener('click', () => {
        let key = document.getElementById("api-key-input").value
        c.api.setAPIKey(key)
    })
})


