// ===================================
// CONFIGURAÇÃO DA GERÊNCIA
// ===================================
const MQTT_CONFIG = {
    broker: 'wss://broker.hivemq.com:8884/mqtt',
    clientId: 'Gerencia_Web_' + Math.random().toString(16).substr(2, 8),
    topic_subscribe_all: 'senai/iot/#' // Tópico Coringa
};

let mqttClient = null;

// ===================================
// FUNÇÕES UTILS (Copiar de app.js)
// ===================================
// [Copie e cole aqui as funções: connectMQTT, updateConnectionStatus, showToast e escapeHtml do seu app.js]

function connectMQTT() {
    try {
        mqttClient = mqtt.connect(MQTT_CONFIG.broker, {
            clientId: MQTT_CONFIG.clientId,
            clean: true,
            reconnectPeriod: 1000,
        });

        mqttClient.on('connect', () => {
            console.log('✓ Gerência conectada ao MQTT Broker');
            updateConnectionStatus(true);
            showToast('Conectado', 'Monitorando todas as transações', 'success');
            
            // SUBSCREVE TÓPICO WILDCARD
            mqttClient.subscribe(MQTT_CONFIG.topic_subscribe_all, { qos: 0 }, (err) => {
                if (!err) {
                    console.log(`✓ Inscrito no tópico: ${MQTT_CONFIG.topic_subscribe_all}`);
                }
            });
        });
        
        // ... (Copie as handlers 'error', 'offline', 'reconnect' do app.js)
        
        mqttClient.on('message', handleMQTTMessage);

    } catch (error) {
        console.error('Erro ao conectar MQTT:', error);
        updateConnectionStatus(false);
    }
}

// ===================================
// TRATAMENTO DE MENSAGENS E LOGS
// ===================================

function handleMQTTMessage(topic, message) {
    try {
        const payload = JSON.parse(message.toString());
        logTransaction(topic, payload);
    } catch (e) {
        console.warn(`Mensagem não JSON recebida no tópico ${topic}`);
    }
}

function logTransaction(topic, payload) {
    const tableBody = document.getElementById('transactionLogTable');
    
    let action = '';
    if (topic === 'senai/iot/pedidos') {
        action = `Pedido Criado (Total: R$ ${payload.total ? payload.total.toFixed(2) : 'N/A'})`;
    } else if (topic.startsWith('senai/iot/status/')) {
        action = `Status Atualizado: ${payload.status.toUpperCase()}`;
    } else {
        action = 'Mensagem de Controle';
    }
    
    const date = new Date();
    const timeStr = date.toLocaleTimeString('pt-BR');
    
    // Cria uma nova linha no topo da tabela
    const newRow = tableBody.insertRow(0); 

    newRow.innerHTML = `
        <td>${timeStr}</td>
        <td>${escapeHtml(topic)}</td>
        <td>${payload.pedido_id || 'N/A'}</td>
        <td>${payload.mesa || 'N/A'}</td>
        <td>${action}</td>
    `;
    
    // Limita o número de linhas para não sobrecarregar
    if (tableBody.rows.length > 50) {
        tableBody.deleteRow(50);
    }
}

// ===================================
// INICIALIZAÇÃO
// ===================================
document.addEventListener('DOMContentLoaded', () => {
    connectMQTT();
    console.log('✓ Gerência App inicializado');
});