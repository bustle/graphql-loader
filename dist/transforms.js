"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.removeUnusedFragments = exports.removeSourceLocations = exports.removeDuplicateFragments = void 0;
function removeDuplicateFragments(document) {
    const usedName = new Set();
    const dedupedDefs = document.definitions.filter((def) => {
        if (def.kind !== 'FragmentDefinition') {
            return true;
        }
        const name = def.name.value;
        if (usedName.has(name)) {
            return false;
        }
        else {
            usedName.add(name);
            return true;
        }
    });
    return { ...document, definitions: dedupedDefs };
}
exports.removeDuplicateFragments = removeDuplicateFragments;
function removeSourceLocations(document) {
    const updatedDoc = { ...document };
    removeFieldDeep(updatedDoc, 'loc');
    return updatedDoc;
}
exports.removeSourceLocations = removeSourceLocations;
function removeFieldDeep(obj, name) {
    for (const field in obj) {
        if (field === name)
            delete obj[field];
        else if (typeof obj[field] === 'object')
            removeFieldDeep(obj[field], name);
    }
}
function removeUnusedFragments(document) {
    const usedFragments = new Set();
    function findFragmentSpreads(doc) {
        function traverse(selectionSet) {
            selectionSet.selections.forEach((selection) => {
                if (selection.kind === 'FragmentSpread') {
                    usedFragments.add(selection.name.value);
                }
                else if (selection.selectionSet) {
                    traverse(selection.selectionSet);
                }
            });
        }
        doc.definitions.forEach((def) => {
            if (def.kind === 'OperationDefinition' || def.kind === 'FragmentDefinition') {
                traverse(def.selectionSet);
            }
        });
    }
    findFragmentSpreads(document);
    const defCount = document.definitions.length;
    const cleanedDefs = document.definitions.filter((def) => def.kind !== 'FragmentDefinition' || usedFragments.has(def.name.value));
    const updatedDoc = { ...document, definitions: cleanedDefs };
    if (defCount !== cleanedDefs.length) {
        // Some references may have been from fragments that were just recently unused.
        // If we removed any fragments, run the function again until we are no longer
        // removing any fragments.
        return removeUnusedFragments(updatedDoc);
    }
    return updatedDoc;
}
exports.removeUnusedFragments = removeUnusedFragments;
