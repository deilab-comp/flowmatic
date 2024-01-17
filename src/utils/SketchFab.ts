import * as $ from 'jquery';
import { resize, recenter } from './SizeConstraints';
import { Vector3 } from 'three';
import { scene, Node, ObjNode } from 'frp-backend';
declare const zip: any;
/*
 *data - contains the resulting data from the request
 *status - contains the status of the request ("success", "notmodified", "error", "timeout", or "parsererror")
 *xhr - contains the XMLHttpRequest object
*/

let updatedUrl: string = '';
let animationList: Array<string> = new Array<string>();

class SketchFab {
    url: string = '';
    private _faces: Map<string, string>;
    private archivesMaxSize: number;
    constructor() {
        this.url = 'https://api.sketchfab.com/'
        this._faces = new Map();
        this.faces = [0, 5000];
    };

    getGLTFUrl(uid: string): string {
        let options: RequestInit = {
            method: 'GET',
            headers: {
                //Authorization: `Token 7378591d3b564fb796e4d0976749e59e`,
                Authorization: `Token 119a2285f0dd4a7d846d03ece8ff2193`,
            },
            mode: 'cors'
        };

        console.log(uid);
        
        let url = new URL(`/v3/models/${uid}/download`, this.url);
        const DOWNLOAD_URL = url.toString();
        fetch(DOWNLOAD_URL, options)
        .then(function(response){
            return response.json();
        }).then(function(data){
            console.log(data);
            const downloadURL: string = data.gltf.url;
            downloadArchive(downloadURL);
        }).catch(e => console.log(e));
        return '';
    };

    getUrl(): string {
        let url = new URL("v3/search", this.url);
        let urlSearch = new URLSearchParams({
            type: "model",
            max_face_count: this._faces.get("max"),
        });
        return new URL(`${url.origin}${url.pathname}?${urlSearch.toString()}`).toString();
    };

    set faces(vals: [number, number]) {
      let min, max;
      if (vals[0] > vals[1])
        [max, min] = vals;
      else [min, max] = vals;
      this._faces.set("min", min.toString());
      this._faces.set("max", max.toString())
    }
};

export function downloadArchive(url: string): void {
    zip.workerScriptsPath = '/vendor/';
    var reader = new zip.HttpReader(url);
    zip.createReader(
        reader,
        function(zipReader) {
            zipReader.getEntries(function(entries){
                console.log(entries);
                ParseContent(entries);
            });
        },
        function(error) {
            console.error(error);
        }
    );
};

function reloadScene(entries: Array<any>, fileUrls: Object, sceneNumber: Number) {
    let json = JSON.parse(fileUrls["scene.gltf"].data);
    if (json.hasOwnProperty('buffers')) {
        for (var j = 0; j < json.buffers.length; j++) {
            json.buffers[j].uri = fileUrls[json.buffers[j].uri];
        }
    }

    if (json.hasOwnProperty('images')) {
        for (var j = 0; j < json.images.length; j++) {
            json.images[j].uri = fileUrls[json.images[j].uri];
        }
    }
    let updatedSceneFileContent = JSON.stringify(json, null, 2);
    let updatedBlob = new Blob([updatedSceneFileContent], { type: 'text/plain' });
    updatedUrl = window.URL.createObjectURL(updatedBlob);
    const animations: Array<any> = json.animations;
    animations.forEach((animation: any) => {
        const animation_name: string = animation.name;
        animationList.push(animation_name);
    });

    CreatePreview();
}

function createSpinner() {
  const text = document.createElement("a-text");
  const preModelEl: any = document.getElementById('preview-model');
  if (!preModelEl)  return;
  text.setAttribute("value", "Loading...");
  preModelEl.appendChild(text);
}

export function ParseContent(entries: Array<any>): void {
    updatedUrl = '';
    animationList = [];
    let content: any;
    let fileUrls: Object = {};
    let item = 0;
    let isProcessed = new Array(entries.length).fill(false);
    const sleep = t => new Promise((resolve, reject) => setTimeout(resolve, t));
    const DEFAULT_SLEEP = 10;
    createSpinner();
    entries.forEach((entry: any, i: number) => {
        entry.getData(new zip.BlobWriter('text/plain'), async function onEnd(data) {
            var url = window.URL.createObjectURL(data);
            fileUrls[entry.filename] = url;
            while (i !== item) await sleep(DEFAULT_SLEEP);
            item++;
            isProcessed[i] = true;
        });
        entry.getData(new zip.TextWriter('text/plain'), async function onEnd(data) {
            // Look at filename
            while (!isProcessed[i]) await sleep(DEFAULT_SLEEP);
            const entryNames: Array<string> = entry.filename.split(".");
            const entryName: string = entryNames[entryNames.length - 1];
            if (entryName == "gltf")
                content = data;

            // Wait till all the entry data are read.
            if (content && i === (entries.length - 1)) {
                // console.log(content);
                // console.log(fileUrls);
            
                var json = JSON.parse(content);
                // Replace original buffers and images by blob URLs
                if (json.hasOwnProperty('buffers')) {
                    for (var j = 0; j < json.buffers.length; j++) {
                        json.buffers[j].uri = fileUrls[json.buffers[j].uri];
                    }
                }
                
                if (json.hasOwnProperty('images')) {
                    for (var j = 0; j < json.images.length; j++) {
                        json.images[j].uri = fileUrls[json.images[j].uri];
                    }
                }
                console.log(json);
                var updatedSceneFileContent = JSON.stringify(json, null, 2);
                var updatedBlob = new Blob([updatedSceneFileContent], { type: 'text/plain' });
                updatedUrl = window.URL.createObjectURL(updatedBlob);
                console.log(updatedUrl);
                // console.log(updatedUrl);
                // console.log(json);

                // Fetch animations
                const animations: Array<any> = json.animations;
                animations.forEach((animation: any) => {
                    const animation_name: string = animation.name;
                    animationList.push(animation_name);
                });

                CreatePreview();
                // CreateGLTFModel(updatedUrl, animationList);
            }
        });
    });
    
};

export function CreatePreview(): void {
    const preModelEl: any = document.getElementById('preview-model');
    if (!preModelEl) {
        console.warn('Cannot find preview element when creating model preview.');
        return;
    }
    preModelEl.removeAttribute('gltf-model');
    preModelEl.removeObject3D('mesh');
    preModelEl.setAttribute('gltf-model', `url(${updatedUrl})`);
}

export function CreateGLTFModel(): void {
    const polyEl: any = document.createElement('a-entity');
    console.log(polyEl);
    // Attach the gltf model.
    polyEl.setAttribute('gltf-model', 'url(' + updatedUrl + ')');

    const redux: any = document.querySelector('#redux');
    redux.appendChild(polyEl);

    // Resize the model.
    polyEl.addEventListener('model-loaded', () => {
        resize(polyEl, 1.0);
        recenter(polyEl);
    });

    // Set the position of the model.
    const rightHand: any = document.querySelector('#rightHand');
    rightHand.object3D.updateMatrix();
    rightHand.object3D.updateMatrixWorld();
    const position = rightHand.object3D.localToWorld(new Vector3(0, -0.4, -0.5));
    polyEl.object3D.position.copy(position.clone());

    // Set movable of the model.
    polyEl.classList.add('movable');

    const attrList: Array<string> = ['class', 'object', 'position', 'rotation', 'scale'];
    const typeList: Array<string> = ['class', 'object', 'vector3', 'vector3', 'vector3'];
    const behaviorList: Array<string> = ['signal', 'signal', 'signal', 'signal', 'signal'];
    
    // Create a object node in frp-backend, attribute updates are front-end driven. Also extract all properties from object file
    const props: any = [{ name: 'class', default: updatedUrl }, { name: 'object', default: `node-${Node.getNodeCount()}` }];
    for (let i = 2; i < attrList.length; i++) {
        const attr: object = {};
        attr['name'] = attrList[i];
        attr['type'] = behaviorList[i];
        attr['behavior'] = behaviorList[i];
        attr['default'] = '';
        props.push(attr);
    }
    animationList.forEach((animationName: string) => {
        const attr: object = {};
        attr['name'] = animationName;
        attr['type'] = 'string';
        attr['behavior'] = 'signal';
        attr['default'] = animationName; 
        props.push(attr);
        attrList.push(animationName);
        behaviorList.push('signal');
        typeList.push('string');
    });

    // Using JSON does not seem efficient
    const objNode = scene.addObj(`node-${Node.getNodeCount()}`, props);
    polyEl.setAttribute('id', objNode.getID()); // Set up node ID
    
    // Add list of attributes next to the model.
    polyEl.setAttribute('attribute-list', {
        attrList: attrList,
        behaviorList: behaviorList,
        typeList: typeList
    });

    // For edge drawing.
    polyEl.classList.add('data-receiver');

    // Set up update for input/output when there is stream updates.
    polyEl.setAttribute('obj-node-update', {
        name: 'anime',
        animeList: animationList
    }); 
};

export const sketchfab = new SketchFab();
