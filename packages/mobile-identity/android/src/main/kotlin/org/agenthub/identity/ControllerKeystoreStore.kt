package org.agenthub.identity

import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/**
 * Android controller credential store.
 *
 * Secrets are encrypted with a key that never leaves the Android Keystore.
 * If the keystore is unavailable this class throws and writes nothing.
 * It does not fall back to a preference store or an application file.
 *
 * This source is not executed in CI. Real-device acceptance is a separate step.
 */
class SecureStorageUnavailableException(message: String) : SecurityException(message)

class ControllerKeystoreStore(
    private val alias: String = "agenthub.controller.session",
) {
    fun isAvailable(): Boolean {
        return try {
            val keystore = KeyStore.getInstance(ANDROID_KEYSTORE)
            keystore.load(null)
            true
        } catch (_: Exception) {
            false
        }
    }

    fun encrypt(plain: ByteArray): ByteArray {
        if (!isAvailable()) {
            throw SecureStorageUnavailableException("Android Keystore is unavailable")
        }
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.ENCRYPT_MODE, secretKey())
        val iv = cipher.iv ?: throw SecureStorageUnavailableException("Android Keystore did not provide an IV")
        val body = cipher.doFinal(plain)
        return iv + body
    }

    fun decrypt(payload: ByteArray): ByteArray {
        if (!isAvailable()) {
            throw SecureStorageUnavailableException("Android Keystore is unavailable")
        }
        if (payload.size <= GCM_IV_BYTES) {
            throw SecureStorageUnavailableException("Android Keystore payload is incomplete")
        }
        val iv = payload.copyOfRange(0, GCM_IV_BYTES)
        val body = payload.copyOfRange(GCM_IV_BYTES, payload.size)
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.DECRYPT_MODE, secretKey(), GCMParameterSpec(128, iv))
        return cipher.doFinal(body)
    }

    private fun secretKey(): SecretKey {
        val keystore = KeyStore.getInstance(ANDROID_KEYSTORE)
        keystore.load(null)
        val existing = keystore.getKey(alias, null) as? SecretKey
        if (existing != null) return existing
        val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, ANDROID_KEYSTORE)
        val spec = KeyGenParameterSpec.Builder(
            alias,
            KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT,
        )
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .setRandomizedEncryptionRequired(true)
            .build()
        generator.init(spec)
        return generator.generateKey()
    }

    private companion object {
        const val ANDROID_KEYSTORE = "AndroidKeyStore"
        const val TRANSFORMATION = "AES/GCM/NoPadding"
        const val GCM_IV_BYTES = 12
    }
}
