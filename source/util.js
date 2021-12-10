/**@file utility functions */

/**
 * Automatically saved the object passed in as a .json file
 * @param {Object} exportObj 
 * @param {string} exportName - Name to save as
 */
// eslint-disable-next-line no-unused-vars
function downloadObjectAsJson(exportObj, exportName) {
    var dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(exportObj));
    var downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", exportName + ".json");
    document.body.appendChild(downloadAnchorNode); // required for firefox
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
}

/**
 * Opens the filepicker to select a file which is then parsed as JSON
 * @returns {Promise<object>} - A promise containing an the parsed JSON object
 */
// eslint-disable-next-line no-unused-vars
async function getJsonUpload () {
    const inputFileElement = document.createElement('input')
    inputFileElement.setAttribute('type', 'file')
    inputFileElement.setAttribute('accept', '.json')
    const event = new Promise(resolve => {
        inputFileElement.addEventListener('change', resolve, false)
    })
    inputFileElement.click()
    const { files } = (await event).target
    if (!files) { return }
    const fileText = await files[0].text()
    return JSON.parse(fileText)
}

/**
 * Returns a new Array containing the members of the calling array which are not in B
 * @param {Array} B
 * @returns {Array}
 */
Array.prototype.notIn = function (B) {
    return this.filter(a => !B.includes(a))
}

/**
 * Returns a new Array containing the members of the calling array which are also in B
 * @param {Array} B
 * @returns {Array}
 */
Array.prototype.in = function (B) {
    return this.filter(a => B.includes(a))
}

const SetAddSingle = Set.prototype.add
Set.prototype.add = function () {
    for (const item of arguments) {
        SetAddSingle.call(this, item);
    }
    return this;
}

/**
 * Copy Object.keys(), Object.values(), and Object.entries() to prototype 
 * for convenience when playing with data
 */
Object.prototype.keys = function () {
    console.warn("Use Object.keys(*) instead")
    return Object.keys(this);
};

Object.prototype.values = function () {
    console.warn("Use Object.values(*) instead")
    return Object.values(this);
};

Object.prototype.entries = function () {
    console.warn("Use Object.entries(*) instead")
    return Object.entries(this);
};