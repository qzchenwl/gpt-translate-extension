// API文档：https://ai.baidu.com/ai-doc/OCR/tk3h7y2aq
// 识别语言类型，默认为CHN_ENG
// 可选值包括：
// - auto_detect：自动检测语言，并识别
// - CHN_ENG：中英文混合
// - ENG：英文
// - JAP：日语
// - KOR：韩语
// - FRE：法语
// - SPA：西班牙语
// - POR：葡萄牙语
// - GER：德语
// - ITA：意大利语
// - RUS：俄语
// - DAN：丹麦语
// - DUT：荷兰语
// - MAL：马来语
// - SWE：瑞典语
// - IND：印尼语
// - POL：波兰语
// - ROM：罗马尼亚语
// - TUR：土耳其语
// - GRE：希腊语
// - HUN：匈牙利语
// - THA：泰语
// - VIE：越南语
// - ARA：阿拉伯语
// - HIN：印地语
//
// 返回值案例：{'words_result': [{'words': 'Chris Murphy', 'location': {'top': 38, 'left': 191, 'width': 284, 'height': 49}}, {'words': '@ChrisMurphyCT', 'location': {'top': 93, 'left': 194, 'width': 351, 'height': 45}}, ...], 'words_result_num': 20, 'log_id': 1640922484978205593}
export async function baiduOcrAccurate(apiKey, secretKey, imageBase64, languageType = 'auto_detect') {
    console.log('baiduOcrAccurate', apiKey.slice(0, 4) + '...', secretKey.slice(0, 4) + '...', imageBase64.slice(0, 4) + '...')
    const accessToken = await getAccessToken(apiKey, secretKey);
    const apiUrl = `https://aip.baidubce.com/rest/2.0/ocr/v1/accurate?access_token=${accessToken}&language_type=${languageType}`;
    const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {'Content-Type': 'application/x-www-form-urlencoded'},
        body: 'image=' + encodeURIComponent(imageBase64)
    });
    const json = await response.json();
    const wordsResult = json.words_result;
    console.log('wordsResult', wordsResult);
    return wordsResult;
}


// API文档：https://cloud.baidu.com/doc/OCR/s/vk3h7y58v
export async function baiduOcrGeneral(apiKey, secretKey, imageBase64) {
    console.log('baiduOcrGeneral', apiKey.slice(0, 4) + '...', secretKey.slice(0, 4) + '...', imageBase64.slice(0, 4) + '...')
    const accessToken = await getAccessToken(apiKey, secretKey);
    const apiUrl = `https://aip.baidubce.com/rest/2.0/ocr/v1/general?access_token=${accessToken}`;
    const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {'Content-Type': 'application/x-www-form-urlencoded'},
        body: `image=${encodeURIComponent(imageBase64)}&detect_language=true`,
    });
    const json = await response.json();
    const wordsResult = json.words_result;
    console.log('wordsResult', wordsResult);
    return wordsResult;
}


// API文档：https://ai.baidu.com/ai-doc/REFERENCE/Ck3dwjhhu#%E8%AF%B7%E6%B1%82url%E6%95%B0%E6%8D%AE%E6%A0%BC%E5%BC%8F
const accessTokenCache = {};

async function getAccessToken(apiKey, secretKey) {
    const now = Date.now();
    const tokenKey = `${apiKey}:${secretKey}`;

    // 如果当前访问令牌有效，则返回它
    if (
        accessTokenCache[tokenKey] &&
        accessTokenCache[tokenKey].accessToken &&
        accessTokenCache[tokenKey].expiryTime &&
        now < accessTokenCache[tokenKey].expiryTime
    ) {
        return accessTokenCache[tokenKey].accessToken;
    }

    const tokenUrl = `https://aip.baidubce.com/oauth/2.0/token?grant_type=client_credentials&client_id=${apiKey}&client_secret=${secretKey}`;
    const response = await fetch(tokenUrl, {method: 'POST'});
    const json = await response.json();

    if (json.access_token) {
        const expiresIn = json.expires_in * 1000 - 5 * 60 * 1000; // 提前 5 分钟过期
        accessTokenCache[tokenKey] = {
            accessToken: json.access_token,
            expiryTime: now + expiresIn,
        };
        return json.access_token;
    } else {
        throw '无法获取访问令牌';
    }
}


export function mergeLinesToParagraphs(wordsResults) {
    const data = wordsResults.map((item) => [item.location.top, item.location.left, item.location.height, item.location.width]);
    const dbscan = new DBSCAN(2, 1, customDistance);
    dbscan.fit(data);

    const clusters = dbscan.clusters.map(clusterIndices =>
        clusterIndices.map(index => wordsResults[index])
    );

    const paragraphs = clusters.map(cluster => {
        const isVertical = cluster[0].location.height > 2 * cluster[0].location.width;

        const sortedCluster = isVertical
            ? cluster.sort((a, b) => a.location.left - b.location.left)
            : cluster.sort((a, b) => a.location.top - b.location.top);

        const paragraphText = sortedCluster.map(item => item.words).join('\n');

        const minX = Math.min(...cluster.map(item => item.location.left));
        const maxX = Math.max(...cluster.map(item => item.location.left + item.location.width));
        const minY = Math.min(...cluster.map(item => item.location.top));
        const maxY = Math.max(...cluster.map(item => item.location.top + item.location.height));
        const sumOfLineHeights = cluster.map(item => isVertical ? item.location.width : item.location.height).reduce((acc, v) => acc + v, 0);
        const boundingHeight = isVertical ? (maxX - minX) : (maxY - minY);
        const fontSize = sumOfLineHeights / cluster.length;
        const lineHeight = boundingHeight / cluster.length;

        return {
            words: paragraphText,
            location: {
                left: minX,
                top: minY,
                width: maxX - minX,
                height: maxY - minY,
            },
            fontSize,
            lineHeight
        };
    });

    return paragraphs.filter(item => !isMeaninglessText(item.words));
}

function customDistance(point1, point2) {
    const [top1, left1, height1, width1] = point1;
    const [top2, left2, height2, width2] = point2;

    const isVertical1 = height1 > 2 * width1;
    const isVertical2 = height2 > 2 * width2;

    if (isVertical1 !== isVertical2) {
        return Infinity; // 如果排列方向不同，返回一个很大的值
    }

    let lineOverlapRatio;
    if (isVertical1) {
        const bottom1 = top1 + height1;
        const bottom2 = top2 + height2;
        const overlapTop = Math.max(top1, top2);
        const overlapBottom = Math.min(bottom1, bottom2);
        lineOverlapRatio = Math.max(0, overlapBottom - overlapTop) / Math.min(height1, height2);
    } else {
        const right1 = left1 + width1;
        const right2 = left2 + width2;
        const overlapLeft = Math.max(left1, left2);
        const overlapRight = Math.min(right1, right2);
        lineOverlapRatio = Math.max(0, overlapRight - overlapLeft) / Math.min(width1, width2);
    }
    if (lineOverlapRatio < 0.5) {
        return Infinity;
    }

    const lineHeight = isVertical1 ? Math.min(width1, width2) : Math.min(height1, height2);
    const lineDistance = isVertical1 ? Math.abs(left1 - left2) : Math.abs(top1 - top2);

    return lineDistance / lineHeight;
}

function isMeaninglessText(str) {
    // 检查是否存在两个以上的连续字母
    if (str.match(/[a-zA-Z]{2,}/)) {
        return false;
    }

    // 检查字符串是否仅由不可见字符、标点符号、字母和数字组成
    return str.match(/^[\p{P}\s0-9a-zA-Z]*$/u);
}

class DBSCAN {
    constructor(eps, minPts, distanceFunction) {
        this.eps = eps;
        this.minPts = minPts;
        this.distance = distanceFunction;
        this.clusters = []; // 存储每个聚类的数据点的下标
    }

    fit(data) {
        this.labels = new Array(data.length).fill(0);
        let clusterId = 0;
        for (let i = 0; i < data.length; i++) {
            if (this.labels[i] !== 0) {
                continue;
            }
            let neighbors = this.regionQuery(data, i);
            if (neighbors.length < this.minPts) {
                this.labels[i] = -1;
                continue;
            }
            clusterId++;
            this.labels[i] = clusterId;
            let clusterIndices = [i];
            this.expandCluster(data, neighbors, clusterIndices, clusterId);
            this.clusters.push(clusterIndices);
        }
    }

    expandCluster(data, neighbors, clusterIndices, clusterId) {
        for (let i = 0; i < neighbors.length; i++) {
            let point = neighbors[i];
            if (this.labels[point] === -1) {
                this.labels[point] = clusterId;
            } else if (this.labels[point] === 0) {
                this.labels[point] = clusterId;
                clusterIndices.push(point);
                let newNeighbors = this.regionQuery(data, point);
                if (newNeighbors.length >= this.minPts) {
                    this.expandCluster(data, newNeighbors, clusterIndices, clusterId);
                }
            }
        }
    }

    regionQuery(data, pointIndex) {
        let neighbors = [];
        for (let i = 0; i < data.length; i++) {
            const distance = this.distance(data[pointIndex], data[i]);
            if (distance < this.eps) {
                neighbors.push(i);
            }
        }
        return neighbors;
    }
}