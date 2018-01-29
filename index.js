import localForage from 'localforage';

const key = 'web-audio';
const defaultOptions = {
    baseUrl: '',
    volumn: 1
};
const AudioContext = window.AudioContext || window.webkitAudioContext;

/**
 *
 * @example
 * let audioPlayer = AudioPlayer.getAudioPlayer({
        baseUrl: '//xxx/music/',
        volumn: 0.7
    });

    audioPlayer.preloadAudios([
        'xxx.mp3'
    ]).then(() => {
        audioPlayer.play('xxx.mp3');
    });
 *
 * @export
 * @class AudioPlayer
 */
export default class AudioPlayer {
    static audioPlayer = null;

    constructor(opts = defaultOptions) {
        this.opts = Object.assign({}, defaultOptions, opts);
        this.audioBufferCache = {};
        this.isSupported = true;

        try {
            this.audioContext = new AudioContext();
        } catch(ex) {
            this.isSupported = false;
            console.log('Your browser does not support AudioContext');
        }
    }

    /**
     * 本地数据库配置
     */
    static getLocalforageConfig() {
        return {
            name: 'audioSound',
            size: 4980736,
            version: 1.0
        };
    }

    static getAudioPlayer(opts = defaultOpts) {
        if(this.audioPlayer) return this.audioPlayer;

        localForage.config(this.getLocalforageConfig());
        this.audioPlayer = new AudioPlayer(opts);

        return this.audioPlayer;
    }

    /**
     * 加载音频文件，优先从缓存读取，加载成功后会存到缓存中
     * 优先级是IndexDB, Web SQL, localStorage
     * @param {string} filename
     * @returns {Promise<AudioBuffer>}
     */
    loadAudio(filename) {
        if(!this.isSupported) return;

        if(this.audioBufferCache[key + filename]) {
            return Promise.resolve(this.audioBufferCache[key + filename]);
        }

        let startTime = Date.now();

        return localForage.getItem(key + filename).then((arrayBuffer) => {
            if (arrayBuffer) {
                // console.log(filename + '从缓存读取，耗时： ', Date.now() - startTime);

                let decodeStartTime = Date.now();

                return new Promise((resolve, reject) => {
                    this.audioContext.decodeAudioData(arrayBuffer, (audioBuffer) => {
                        if(audioBuffer) {
                            // console.log(filename, ' 解码耗时： ', Date.now() - decodeStartTime,);
                            this.audioBufferCache[key + filename] = audioBuffer;
                            resolve(audioBuffer);
                        } else {
                            reject(new Error(filename, ' decodeAudioData empty'));
                        }
                    });
                });
            } else {
                let requestStartTime = Date.now();

                return new Promise((resolve, reject) => {
                    let xhr = new XMLHttpRequest();

                    const url = this.opts.baseUrl ? `${this.opts.baseUrl}/${filename}` : filename

                    xhr.open('GET', url, true);
                    xhr.responseType = 'arraybuffer';

                    xhr.onload = () => {
                        let res = xhr.response;

                        // console.log(filename, '请求耗时：', Date.now() - requestStartTime, ' 总耗时：', Date.now() - startTime);

                        localForage.setItem(key + filename, res).then(() => {
                            // console.log(filename + '存入缓存');
                        });

                        let decodeStartTime = Date.now();

                        this.audioContext.decodeAudioData(res, (audioBuffer) => {
                            if(audioBuffer) {
                                // console.log(filename, ' 解码耗时： ', Date.now() - decodeStartTime,);
                                this.audioBufferCache[key + filename] = audioBuffer;
                                resolve(audioBuffer);
                            } else {
                                reject(new Error(filename, ' decodeAudioData empty'));
                            }
                        });
                    };
                    xhr.onerror = () => {
                        reject(new Error('loadAudio request error'));
                    };

                    xhr.send();
                });
            }
        });
    }

    /**
     * 预加载音频文件，会缓存到本地数据库里
     * @param {Array<string>} files 文件路径列表
     */
    preloadAudios(files) {
        if(!this.isSupported) return;

        let preLoadSound = (file) => {
            return new Promise((resolve, reject) => {
                this.loadAudio(file).then((audioBuffer) => {
                    if (audioBuffer) {
                        resolve(audioBuffer);
                    } else {
                        reject(new Error('preLoad ' + file + ' response no data'));
                    }
                }).catch(err => {
                    reject(new Error('preLoad ' + file + ' error: ' + (err && err.message || '')));
                });
            });
        };

        if (typeof files == 'string') {
            return preLoadSound(files);
        } else if (Array.isArray(files)) {
            let promises = files.map((item) => {
                return preLoadSound(item);
            });
            return Promise.all(promises);
        }

        return Promise.reject(new Error('preLoad args error'));
    }

    /**
     * 播放单个音频文件
     * @param {string} file
     * @param {object?} options
     * @returns {Function} 返回可暂停播放函数
     */
    play(file, options = {
        loop: false
    }) {
        if(!this.isSupported) return;

        let source = null;
        let startTime = Date.now();

        this.loadAudio(file).then((audioBuffer) => {
            if(audioBuffer) {
                let bufferSource = this.audioContext.createBufferSource();
                source = bufferSource;
                source.buffer = audioBuffer;
                source.loop = options.loop || false;
                let dest = this.setVolume(options.volumn || this.opts.volumn);
                source.connect(dest);
                source.start(0);

                source.onended = function() {
                    // console.log(file, '播放结束');
                };
                // console.log('正在播放音乐： ', file, ' 总耗时：', Date.now() - startTime);
            }
        });

        return () => {
            if(source) {
                source.stop(0);
                source.disconnect();
                source.onended = null;
            }
        };
    }

    /**
     * 设置音量
     * @param {number} value
     * @returns {GainNode}
     */
    setVolume(value = 1) { //value >= 0 || value <= 1;
        const gainNode = this.audioContext.createGain();
        if (gainNode.setTargetAtTime) {
            gainNode.setTargetAtTime(value, this.audioContext.currentTime, 0);
        } else {
            gainNode.gain.value = value;
        }

        gainNode.connect(this.audioContext.destination);
        return gainNode;
    }
}
