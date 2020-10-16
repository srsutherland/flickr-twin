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
 * Returns an Array containing the members of A which are not in B
 * @param {Array} inputA 
 * @param {Array} inputB 
 */
// eslint-disable-next-line no-unused-vars
function aNotInB(inputA, inputB) {
    return inputA.filter(a => !inputB.includes(a))
}