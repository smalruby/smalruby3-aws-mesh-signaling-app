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
            action: 'offer',
            result: false,
            data: {}
        };

        try {
            const postData = JSON.parse(event.body).data;

            const meshId = postData.meshId;
            // TODO: validate meshId
            response.data.meshId = meshId;

            const hostMeshId = postData.hostMeshId;
            // TODO: validate hostMeshId

            const clientDescription = postData.clientDescription;
            // TODO: validate clientDescription

            const queryParams = {
                TableName: TABLE_NAME,
                IndexName: 'meshId-index',
                KeyConditionExpression: 'meshId = :meshId',
                FilterExpression: 'sourceIp = :sourceIp and isHost = :isHost',
                ExpressionAttributeValues: {
                    ':meshId': hostMeshId,
                    ':sourceIp': sourceIp,
                    ':isHost': 1
                },
                ProjectionExpression: 'connectionId, meshId',
                Limit: 1
            };
            const hostData = await ddb.query(queryParams).promise();
            if (!hostData || hostData.Items.length !== 1) {
                throw `Not registered Host Mesh ID: ${hostMeshId}`;
            }

            const host = hostData.Items[0];
            const hostConnectionId = host.connectionId;
            response.data.hostMeshId = host.meshId;

            const ttl = Math.floor(Date.now() / 1000) + TTL_SECONDS;
            const putParams = {
                TableName: TABLE_NAME,
                Item: {
                    meshId: meshId,
                    connectionId: connectionId,
                    isHost: 0,
                    sourceIp: sourceIp,
                    ttl: ttl
                }
            };
            await ddb.put(putParams).promise();

            const offerToHost = {
                action: 'offer',
                data: {
                    meshId: meshId,
                    hostMeshId: host.meshId,
                    clientDescription: clientDescription
                }
            };
            await apigwManagementApi.postToConnection({
                ConnectionId: hostConnectionId,
                Data: JSON.stringify(offerToHost)
            }).promise();

            response.result = true;

            await apigwManagementApi.postToConnection({
                ConnectionId: connectionId,
                Data: JSON.stringify(response)
            }).promise();

            return { statusCode: 200, body: 'Offered.' };
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
        return { statusCode: 500, body: 'Failed to offer: ' + JSON.stringify(err) };
    }
};
