const AWS = require('aws-sdk');

const TTL_SECONDS = 5 * 60;
const { TABLE_NAME, AWS_REGION } = process.env;

const ddb = new AWS.DynamoDB.DocumentClient({ apiVersion: '2012-08-10', region: AWS_REGION });

exports.handler = async event => {
    try {
        const connectionId = event.requestContext.connectionId;
        const sourceIp = event.requestContext.identity.sourceIp;

        let domainName = event.requestContext.domainName;
        if (event.requestContext.apiId) {
            domainName = `${event.requestContext.apiId}.execute-api.${AWS_REGION}.amazonaws.com`;
        }
        const apigwManagementApi = new AWS.ApiGatewayManagementApi({
            apiVersion: '2018-11-29',
            endpoint: domainName + '/' + event.requestContext.stage
        });

        const response = {
            action: 'register',
            result: false,
            data: {}
        };

        try {
            const postData = JSON.parse(event.body).data;

            const meshId = postData.meshId;
            // TODO: validate meshId
            response.data.meshId = meshId;

            const ttl = Math.floor(Date.now() / 1000) + TTL_SECONDS;
            const putParams = {
                TableName: TABLE_NAME,
                Item: {
                    meshId: meshId,
                    connectionId: connectionId,
                    isHost: 1,
                    sourceIp: sourceIp,
                    ttl: ttl
                }
            };
            await ddb.put(putParams).promise();

            response.result = true;

            await apigwManagementApi.postToConnection({
                ConnectionId: connectionId,
                Data: JSON.stringify(response)
            }).promise();

            return { statusCode: 200, body: 'Registered.' };
        }
        catch (err){
            response.data.error = JSON.stringify(err);

            await apigwManagementApi.postToConnection({
                ConnectionId: connectionId,
                Data: JSON.stringify(response)
            }).promise();

            throw err;
        }
    } catch (err) {
        return { statusCode: 500, body: 'Failed to register: ' + JSON.stringify(err) };
    }
};
