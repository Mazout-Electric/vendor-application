import { NativeEventEmitter, NativeModules, PermissionsAndroid, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import React, { useEffect, useState } from "react";
import BleManager from 'react-native-ble-manager';
import {
    widthPercentageToDP as wp,
    heightPercentageToDP as hp,
} from 'react-native-responsive-screen';
import { FlatList } from "react-native-gesture-handler";
import RippleEffect from "./RippleEffect";
import { authenticateDevice } from './Authentication';

const ConnectDevice = () => {
    const [isScanning, setScanning] = useState(false);
    const [bleDevices, setDevices] = useState([]);
    const [currentDevice, setCurrentDevice] = useState<any>(null);
    const BleManagerModule = NativeModules.BleManager;
    const BleManagerEmitter = new NativeEventEmitter(BleManagerModule);
    const [connectedDevice, setConnectedDevice] = useState(null);
    const [authStatus, setAuthStatus] = useState('');

    useEffect(() => {
        BleManager.start({ showAlert: false }).then(() => {
            console.log('Module initialized');
        });

        BleManager.enableBluetooth().then(() => {
            console.log("Bluetooth is turned on!");
            requestPermission();
        }).catch((error) => {
            console.log("The user refused to enable bluetooth", error);
        });

        const stopListener = BleManagerEmitter.addListener('BleManagerStopScan', () => {
            setScanning(false);
            handleGetConnectedDevices();
            console.log('Scan stopped');
        });

        const disconnected = BleManagerEmitter.addListener('BleManagerDisconnectPeripheral', peripheral => {
            console.log('Disconnected Device', peripheral);
            if (currentDevice?.id === peripheral.id) {
                setCurrentDevice(null);
            }
        });

        const characteristicValueUpdate = BleManagerEmitter.addListener('BleManagerDidUpdateValueForCharacteristic', data => {
            readCharacteristicFromEvent(data);
        });

        return () => {
            stopListener.remove();
            disconnected.remove();
            characteristicValueUpdate.remove();
        };
    }, [currentDevice]);

    const requestPermission = async () => {
        try {
            await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN);
            await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT);
            await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.BLUETOOTH_ADVERTISE);
            await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION);
            await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION);
        } catch (error) {
            console.log('Permission request failed', error);
        }
    };

    const startScanning = () => {
        if (!isScanning) {
            BleManager.scan([], 10, false).then(() => {
                console.log('Scan started...');
                setScanning(true);
            }).catch((error) => {
                console.log('Scan failed to start', error);
            });
        }
    };

    const handleGetConnectedDevices = () => {
        BleManager.getDiscoveredPeripherals().then((result: any) => {
            if (result.length === 0) {
                console.log("No Device Found");
                startScanning();
            } else {
                const allDevices = result.filter((item: any) => item.name !== null);
                setDevices(allDevices);
            }
            console.log("Discovered peripherals: " + result);
        }).catch((error) => {
            console.log("Failed to get discovered peripherals", error);
        });
    };

    const onConnect = async (item: any) => {
        try {
            await BleManager.connect(item.id);
            setCurrentDevice(item);
            const result = await BleManager.retrieveServices(item.id);
            console.log('Device Connected', result);
            onServiceDiscovered(result, item);
        } catch (error) {
            console.log("Error in connecting", error);
        }
    };

    const onServiceDiscovered = async (result: any, item: any) => {
        console.log('Service Discovered', result);
        try {
            const authStatus = await authenticateDevice(item);
            console.log('Authentication Status:', authStatus);
            setAuthStatus(authStatus ? 'Authorized' : 'Unauthorized');
        } catch (error) {
            console.error('Authorization error:', error);
            setAuthStatus('Authorization failed');
        }
    };

    const onDisconnect = async (item: any) => {
        try {
            await BleManager.disconnect(item.id);
            console.log('Disconnected');
            if (currentDevice?.id === item.id) {
                setCurrentDevice(null);
            }
        } catch (error) {
            console.log("Error in disconnecting", error);
        }
    };

    const renderItem = ({ item }: any) => {
        return (
            <View style={styles.bleCard}>
                <Text style={styles.bleTxt}>{item.name}</Text>
                <TouchableOpacity onPress={() => { currentDevice?.id === item?.id ? onDisconnect(item) : onConnect(item) }} style={styles.button}>
                    <Text style={styles.btnTxt}>{currentDevice?.id === item?.id ? "Disconnect" : "Connect"}</Text>
                </TouchableOpacity>
            </View>
        );
    };

    return (
        <View style={styles.container}>
            {isScanning ? <View style={styles.rippleView}>
                <RippleEffect />
            </View> : <View>
                <FlatList
                    data={bleDevices}
                    keyExtractor={(item, index) => index.toString()}
                    renderItem={renderItem}
                />
            </View>}
            <TouchableOpacity onPress={() => startScanning()} style={styles.scanBtn}>
                <Text style={styles.btnTxt}>Start Scan</Text>
            </TouchableOpacity>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    rippleView: {
        flex: 1,
        justifyContent: "center",
        alignItems: "center"
    },
    bleCard: {
        width: "90%",
        padding: 10,
        alignSelf: "center",
        marginVertical: 10,
        backgroundColor: '#f2d492',
        elevation: 5,
        borderRadius: 5,
        flexDirection: "row",
        justifyContent: "space-between"
    },
    bleTxt: {
        fontSize: 18,
        fontWeight: 'bold',
        color: "#2c2c2c"
    },
    btnTxt: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#fff'
    },
    button: {
        width: 100,
        height: 40,
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 5,
        backgroundColor: "#f29559"
    },
    scanBtn: {
        width: "90%",
        height: 50,
        justifyContent: "center",
        alignItems: "center",
        backgroundColor: "#007AFF",
        borderRadius: 5,
        alignSelf: "center",
        marginBottom: hp(2),
        marginTop: 10
    }
});

export default ConnectDevice;
