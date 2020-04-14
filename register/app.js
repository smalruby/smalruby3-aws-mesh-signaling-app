const AWS = require('aws-sdk');

const ddb = new AWS.DynamoDB.DocumentClient({ apiVersion: '2012-08-10', region: process.env.AWS_REGION });

const { TABLE_NAME } = process.env;

exports.handler = async event => {
    try {
        const postData = JSON.parse(event.body).data;

        // TODO: validate meshId
        const meshId = postData.meshId;
        const connectionId = event.requestContext.connectionId;
        const sourceIp = event.requestContext.identity.sourceIp;
        const ttl = Math.floor(Date.now() / 1000) + 60 * 60;

        const putParams = {
            TableName: process.env.TABLE_NAME,
            Item: {
                meshId: meshId,
                connectionId: connectionId,
                host: 1,
                sourceIp: sourceIp,
                ttl: ttl
            }
        };
        await ddb.put(putParams).promise();

        const apigwManagementApi = new AWS.ApiGatewayManagementApi({
            apiVersion: '2018-11-29',
            endpoint: event.requestContext.domainName + '/' + event.requestContext.stage
        });
        const response = {
            action: 'register',
            result: true,
            data: {
                meshId: meshId
            }
        };
        await apigwManagementApi.postToConnection({ ConnectionId: connectionId, Data: JSON.stringify(response )}).promise();

        return { statusCode: 200, body: 'Registered.' };
    } catch (err) {
        return { statusCode: 500, body: 'Failed to register: ' + JSON.stringify(err) };
    }
};
