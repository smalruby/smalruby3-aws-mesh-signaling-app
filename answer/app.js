const AWS = require('aws-sdk');

const ddb = new AWS.DynamoDB.DocumentClient({ apiVersion: '2012-08-10', region: process.env.AWS_REGION });

const { TABLE_NAME } = process.env;

const TTL_SECONDS = 5 * 60;

exports.handler = async event => {
    try {
        const connectionId = event.requestContext.connectionId;
        const sourceIp = event.requestContext.identity.sourceIp;

        const apigwManagementApi = new AWS.ApiGatewayManagementApi({
            apiVersion: '2018-11-29',
            endpoint: event.requestContext.domainName + '/' + event.requestContext.stage
        });

        const response = {
            action: 'answer',
            result: false,
            data: {}
        };

        try {
            const postData = JSON.parse(event.body).data;

            const meshId = postData.meshId;
            // TODO: validate meshId
            response.data.meshId = meshId;

            const clientMeshId = postData.clientMeshId;
            // TODO: validate clientMeshId

            const hostDescription = postData.hostDescription;
            // TODO: validate hostDescription

            const ttl = Math.floor(Date.now() / 1000) + TTL_SECONDS;
            // TODO: update host ttl, check isHost
            /*
            const putParams = {
                TableName: process.env.TABLE_NAME,
                Item: {
                    meshId: meshId,
                    connectionId: connectionId,
                    isHost: 1,
                    sourceIp: sourceIp,
                    ttl: ttl
                }
            };
            await ddb.put(putParams).promise();
            */

            const scanParams = {
                TableName: process.env.TABLE_NAME,
                ProjectionExpression: 'connectionId, meshId',
                FilterExpression: 'meshId = :meshId and isHost = :isHost',
                ExpressionAttributeValues: {
                    ':meshId': clientMeshId,
                    ':isHost': 0
                }
            };
            const clientData = await ddb.scan(scanParams).promise();
            if (clientData.Items.length !== 1) {
                throw `Not exists Client Mesh ID: ${clientMeshId}`;
            }

            const client = clientData.Items[0];
            const clientConnectionId = client.connectionId;
            response.data.clientMeshId = client.meshId;

            const answerToClient = {
                action: 'answer',
                data: {
                    meshId: meshId,
                    clientMeshId: client.meshId,
                    hostDescription: hostDescription
                }
            };
            await apigwManagementApi.postToConnection({
                ConnectionId: clientConnectionId,
                Data: JSON.stringify(answerToClient)
            }).promise();

            response.result = true;

            await apigwManagementApi.postToConnection({
                ConnectionId: connectionId,
                Data: JSON.stringify(response)
            }).promise();

            return { statusCode: 200, body: 'Answered.' };
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
        return { statusCode: 500, body: 'Failed to answer: ' + JSON.stringify(err) };
    }
};
