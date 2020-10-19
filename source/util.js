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
 * Copy Object.keys() and Object.values() to prototype for convenience when playing with data
 */
Object.prototype.keys = function () {
    console.warn("Use Object.keys(*) instead")
    return Object.keys(this);
};

Object.prototype.values = function () {
    console.warn("Use Object.values(*) instead")
    return Object.values(this);
};
