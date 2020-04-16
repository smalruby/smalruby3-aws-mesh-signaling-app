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

            const getParams = {
                TableName: TABLE_NAME,
                Key: {
                    connectionId: connectionId
                },
                ProjectionExpression: 'meshId, isHost'
            };

            const hostData = await ddb.get(getParams).promise();
            const host = hostData.Item;
            if (host) {
                if (host.meshId !== meshId) {
                    throw `Invalid Host Mesh ID: expected=<${host.meshId}> actual=<${meshId}>`;
                }

                if (!host.isHost) {
                    throw 'You are not Host';
                }
            } else {
                throw `Already expired: meshId=<${meshId}>`;
            }

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

            const queryParams = {
                TableName: TABLE_NAME,
                IndexName: 'meshId-index',
                KeyConditionExpression: 'meshId = :meshId',
                FilterExpression: 'sourceIp = :sourceIp and isHost = :isHost',
                ExpressionAttributeValues: {
                    ':meshId': clientMeshId,
                    ':sourceIp': sourceIp,
                    ':isHost': 0
                },
                ProjectionExpression: 'connectionId, meshId',
                Limit: 1
            };

            const clientData = await ddb.query(queryParams).promise();
            if (!clientData || clientData.Items.length !== 1) {
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
